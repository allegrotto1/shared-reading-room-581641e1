import * as THREE from 'three';
import {loadMedia, readMedia} from './media.js?rev=lighting7';

async function readDiffuseFields(textureLoader, pose) {
  return Promise.all(['origin','side'].map(async key=>{
    const [light,depth]=await Promise.all(['diffuse','depth'].map(pass=>
      loadMedia(textureLoader, './pilot/light-fields/'+key+'-'+pass+'.png')));
    light.colorSpace=THREE.SRGBColorSpace;
    light.minFilter=THREE.LinearFilter;
    light.generateMipmaps=false;
    depth.colorSpace=THREE.NoColorSpace;
    depth.minFilter=depth.magFilter=THREE.NearestFilter;
    depth.generateMipmaps=false;
    const c=new THREE.PerspectiveCamera(pose.fov,4/3,.04,60);
    c.rotation.order='YXZ';
    c.rotation.set(pose.pitch,pose.yaw,0);
    c.position.set(pose[key][0],pose.eyeHeight,-pose[key][1]);
    c.updateMatrixWorld();
    return {light,depth,origin:c.position.clone(),pv:c.projectionMatrix.clone().multiply(c.matrixWorldInverse)};
  }));
}

export async function getPilotInputs(renderer, loader, hdrLoader, pmrem, pose) {
  const textureLoader = new THREE.TextureLoader();
  const [hardware, fixtures, shell, probe, carpet, fibers, response,fields] = await Promise.all([
    loadMedia(loader, './pilot/hardware.glb'), loadMedia(loader, './pilot/fixtures-hd.glb'),
    loadMedia(loader, './pilot/shell-hd.glb'),
    loadMedia(hdrLoader, './pilot/entrance-reflection.hdr'),
    loadMedia(textureLoader, './pilot/surfaces/carpet-detail.png'),
    loadMedia(textureLoader, './pilot/surfaces/carpet-normal.png'),
    readMedia('./pilot/surfaces/blender-view-lut.bin'),readDiffuseFields(textureLoader,pose)
  ]);
  if (!response.ok) throw new Error('Unable to load the Blender view transform');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== 64 ** 3 * 4) throw new Error('Incomplete Blender view transform');
  const lut = new THREE.Data3DTexture(bytes, 64, 64, 64);
  lut.format = THREE.RGBAFormat;
  lut.type = THREE.UnsignedByteType;
  lut.minFilter = lut.magFilter = THREE.LinearFilter;
  lut.generateMipmaps = false;
  lut.unpackAlignment = 1;
  lut.needsUpdate = true;
  for (const texture of [carpet, fibers]) {
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.minFilter = THREE.LinearMipmapLinearFilter;
  }
  const reflection = pmrem.fromEquirectangular(probe);
  probe.dispose();
  return {hardware: hardware.scene, fixtures: fixtures.scene, shell:shell.scene, reflection, carpet, fibers, lut,fields};
}

export function isDoor(name) {
  return /^Entrance (?:door (?:glass|centre mullion)|fixed side glass|metal (?:jamb|rail)|handle)/i.test(name);
}

// Geometry has already been placed in world coordinates. The same scene edit is made before the Cycles renders.
export function adjustDoor(geometry, name) {
  const delta = .19;
  if (/Entrance (?:door centre mullion|handle)/i.test(name)) geometry.translate(-delta, 0, 0);
  else if (/Entrance (?:door glass|fixed side glass)/i.test(name)) {
    geometry.computeBoundingBox();
    const {min, max} = geometry.boundingBox;
    const centre = (min.x + max.x) / 2, width = max.x - min.x;
    const change = /fixed side glass/i.test(name) ? delta : -delta;
    geometry.translate(-centre, 0, 0);
    geometry.scale((width + change) / width, 1, 1);
    geometry.translate(centre - delta / 2, 0, 0);
  }
}

const boxProjection = [
  'vec3 direction = reflectVec;',
  'vec3 r = mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),direction)) * max(abs(direction),vec3(0.0001));',
  'vec3 v = clamp(vPodWorld, podBoxMin + 0.005, podBoxMax - 0.005);',
  'vec3 distances = (mix(podBoxMin,podBoxMax,step(vec3(0.0),r)) - v) / r;',
  'vec3 corrected = v + r * min(distances.x,min(distances.y,distances.z)) - podProbe;',
  'reflectVec = normalize(mix(reflectVec,normalize(corrected),smoothstep(0.6,2.0,vPodWorld.z)));'
].join('\n');

// These maps contain only measured diffuse radiance at real surface positions.
// They are attached to opaque geometry. Both the weights and the depth tests are independent of the visitor's camera.
const sampleDiffuseField = `
  vec4 podDiffuseSample(sampler2D lightData,sampler2D depths,mat4 projector,vec3 origin,vec3 N) {
    vec4 clip = projector * vec4(vPodWorld,1.);
    vec2 uv = .5 + .5*clip.xy/max(clip.w,.0001);
    if(clip.w<=0.0 || any(lessThan(uv,vec2(.001))) || any(greaterThan(uv,vec2(.999)))) return vec4(0.);
    vec3 packedZ = texture2D(depths,uv).rgb;
    float z=(floor(255.*packedZ.r+.5)*256.+floor(255.*packedZ.g+.5))*32./65535.;
    float tolerance = .008 + .0025*clip.w;
    float visible = 1.-smoothstep(.35*tolerance,tolerance,abs(z-clip.w));
    float facing = dot(N,normalize(origin-vPodWorld));
    float border=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
    float w=step(.50,packedZ.b)*visible*smoothstep(.04,.23,facing)*smoothstep(.001,.011,border);
    return vec4(texture2D(lightData,uv).rgb*4.*w,w);
  }`;

// Integrate the six photographed panels, using the lens dimensions in the Blender working file.
const practicalSpecular = `
  vec3 podCeilingSpecular(vec3 N,vec3 V,float r,vec3 F0) {
    float nv=max(dot(N,V),.001);
    float a=max(.22,r); float a2=a*a*a*a;
    vec3 sum=vec3(0.);
    for(int panel=0;panel<6;panel++) for(int sampleID=0;sampleID<4;sampleID++) {
      vec2 offset=vec2(sampleID%2==0?-.288675:.288675,sampleID<2?-.288675:.288675)*podPanelSize[panel];
      vec3 lamp=podPanels[panel]+vec3(offset.x,0.,offset.y);
      vec3 delta=lamp-vPodWorld;float d2=dot(delta,delta);
      vec3 L=delta*inversesqrt(max(.001,d2));float nl=max(dot(N,L),0.);
      vec3 H=normalize(L+V);float nh=max(dot(N,H),0.); float vh=max(dot(V,H),0.);
      float denom=nh*nh*(a2-1.)+1.;
      float D=a2/(3.14159*denom*denom);
      float visibility=.5/max(.003,nl*sqrt(a2+(1.-a2)*nv*nv)+nv*sqrt(a2+(1.-a2)*nl*nl));
      vec3 F=F0+(1.-F0)*pow(1.-vh,5.);
      sum+=F*(D*visibility*nl*max(L.y,0.)*podPanelSize[panel].x*podPanelSize[panel].y/(4.*max(.12,d2)));
    }
    return vec3(7.2,5.6,4.15)*sum;
  }`;

export function attachFinish(mat, inputs, pose, kind) {
  const floor = kind === 'floor';
  const localEnv = kind === 'door' || kind === 'hardware';
  const sampled = kind!=='shell'&&kind!=='lighting'&&mat.isMeshStandardMaterial&&!mat.transparent&&!(mat.transmission>.08)&&mat.metalness<.6&&
    !/diffuser|lightbox|exit face|transmitted light|entrance glass|reflective band|door etch/i.test(mat.name);
  const extraDiffuse=kind==='hardware'&&mat.isMeshStandardMaterial&&!mat.transparent&&mat.metalness<.65&&
    !/transmitted light|white exit face|wall infill|warm white/i.test(mat.name);
  const directSpec=mat.isMeshStandardMaterial&&(kind==='fixture'||kind==='door'||(sampled&&kind==='hardware'))&&
    !(mat.transmission>.08)&&!/transmitted light|white exit face/i.test(mat.name);
  if (localEnv) mat.envMap = inputs.reflection.texture;
  if (kind === 'door') {
    mat.envMapIntensity = .96;
    if (/frosted/i.test(mat.name)) {
      mat.color.setRGB(.79,.84,.80);
      mat.roughness = .32;
      mat.ior = 1.45;
      mat.thickness = .008;
    } else if (/steel/i.test(mat.name)) mat.roughness = .24;
  }
  if (kind === 'fixture') {
    mat.envMapIntensity=.85;
    mat.envMapRotation.y=Math.PI/2;
    mat.normalScale?.set(.70,.70);
  }
  if (kind === 'hardware') mat.envMapIntensity=mat.metalness>.6 ? 1.1 : 1.18;
  if (kind === 'shell'||kind === 'floor') mat.envMapIntensity=.18;
  if (/reverse-cut/i.test(mat.name)) {
    mat.transparent=true; mat.depthWrite=false; mat.envMapIntensity=.3;
  }

  const declarations=['#include <common>','varying vec3 vPodWorld;',
    'uniform highp sampler3D podViewLut;',
    'uniform vec3 podProbe, podBoxMin, podBoxMax;'];
  if(floor) declarations.push('uniform sampler2D podCarpet, podFibers;');
  if(directSpec||extraDiffuse) declarations.push('uniform vec3 podPanels[6]; uniform vec2 podPanelSize[6];');
  if(directSpec) declarations.push(practicalSpecular);
  if(sampled)declarations.push('uniform sampler2D podDiffuseA,podDepthA,podDiffuseB,podDepthB;',
    'uniform mat4 podProjectionA,podProjectionB; uniform vec3 podOriginA,podOriginB;',sampleDiffuseField);
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      podViewLut:{value:inputs.lut}, podCarpet:{value:inputs.carpet}, podFibers:{value:inputs.fibers},
      podProbe:{value:new THREE.Vector3(pose.probe[0],pose.probe[2],-pose.probe[1])},
      podBoxMin:{value:new THREE.Vector3(...pose.probeBounds[0])},podBoxMax:{value:new THREE.Vector3(...pose.probeBounds[1])}
    });
    if(directSpec||extraDiffuse) {
      shader.uniforms.podPanels={value:pose.officePanels.map(panel=>new THREE.Vector3(...panel.center))};
      shader.uniforms.podPanelSize={value:pose.officePanels.map(panel=>new THREE.Vector2(...panel.size))};
    }
    if(sampled) {
      for (const [i,suffix] of [[0,'A'],[1,'B']]) {
        const field=inputs.fields[i];
        shader.uniforms['podDiffuse'+suffix]={value:field.light};
        shader.uniforms['podDepth'+suffix]={value:field.depth};
        shader.uniforms['podProjection'+suffix]={value:field.pv};
        shader.uniforms['podOrigin'+suffix]={value:field.origin};
      }
    }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPodWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPodWorld = (modelMatrix * vec4(transformed,1.)).xyz;');
    let frag = shader.fragmentShader.replace('#include <common>',declarations.join('\n'));
    if (localEnv && mat.isMeshStandardMaterial) {
      const original = THREE.ShaderChunk.envmap_physical_pars_fragment;
      const anchor = 'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );';
      frag = frag.replace('#include <envmap_physical_pars_fragment>', original.replace(anchor, anchor+'\n'+boxProjection));
    }
    if (extraDiffuse) {
      const localDiffuse=[
        '#include <lights_fragment_end>',
        'for(int panel=0;panel<6;panel++){',
        'vec3 lightVec=podPanels[panel]-vPodWorld;',
        'float dist2=dot(lightVec,lightVec);',
        'vec3 L=normalize(lightVec);',
        'float receiver=max(dot(normal,normalize(mat3(viewMatrix)*L)),0.);',
        'float emitter=max(L.y,0.);',
        'reflectedLight.directDiffuse+=diffuseColor.rgb*(1.-metalnessFactor)*vec3(1.0,.91,.78)*(1.4*podPanelSize[panel].x*podPanelSize[panel].y*receiver*emitter/(dist2+.24));}'
      ].join('\n');
      frag=frag.replace('#include <lights_fragment_end>',localDiffuse);
    }
    if (floor) {
      frag=frag.replace('#include <roughnessmap_fragment>', [
        '#include <roughnessmap_fragment>',
        'float carpetWeight = (1.0-smoothstep(.012,.028,abs(vPodWorld.y-.005))) * smoothstep(-2.2,-1.95,vPodWorld.z) * (1.0-smoothstep(.1,.55,vPodWorld.x));',
        'vec2 carpetUV = vec2(vPodWorld.x,-vPodWorld.z);',
        'vec4 weave = texture2D(podCarpet,carpetUV);',
        'roughnessFactor = mix(roughnessFactor,weave.g,carpetWeight);'
      ].join('\n')).replace('#include <normal_fragment_maps>',[
        '#include <normal_fragment_maps>',
        'vec3 fiberN = normalize(texture2D(podFibers,carpetUV).xyz*2.0-1.0);',
        'vec3 grainTilt = mat3(viewMatrix)*vec3(fiberN.x,0.0,-fiberN.y);',
        'normal=normalize(normal+grainTilt*carpetWeight);'
      ].join('\n')).replace('#include <emissivemap_fragment>',[
        '#include <emissivemap_fragment>',
        'totalEmissiveRadiance *= mix(1.,2.0*weave.r,carpetWeight);'
      ].join('\n'));
    }
    if(sampled) {
      const anchor='vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
      const lighting=[
        'vec3 storedDiffuse=totalDiffuse+totalEmissiveRadiance;',
        'vec3 receiverNormal=transformNormalByInverseViewMatrix(normal,viewMatrix);',
        'vec4 field0=podDiffuseSample(podDiffuseA,podDepthA,podProjectionA,podOriginA,receiverNormal);',
        'vec4 field1=podDiffuseSample(podDiffuseB,podDepthB,podProjectionB,podOriginB,receiverNormal);',
        'float measured=field0.a+field1.a;',
        'vec3 measuredDiffuse=(field0.rgb+field1.rgb)/max(measured,.0001);',
        floor?'measuredDiffuse*=mix(1.0,mix(1.0,2.0*weave.r,.24),carpetWeight);':'',
        'vec3 outgoingLight=mix(storedDiffuse,measuredDiffuse,smoothstep(.0,.82,measured))+totalSpecular;'
      ].join('\n');
      frag=frag.replace(anchor,lighting);
    }
    if(directSpec) {
      frag=frag.replace('#include <opaque_fragment>',
        'outgoingLight+=podCeilingSpecular(transformNormalByInverseViewMatrix(normal,viewMatrix),normalize(cameraPosition-vPodWorld),roughnessFactor,mix(vec3(.04),diffuseColor.rgb,metalnessFactor));\n#include <opaque_fragment>');
    }
    // The LUT is an actual display transform sampled from the native scene, including exposure and white balance.
    // Apply only on display passes. Transmission buffers and the environment stay in scene-linear light.
    const display = [
      '#ifdef TONE_MAPPING',
      'vec3 lin=max(gl_FragColor.rgb,vec3(0.));',
      'vec3 t=log2(1.+30.*min(lin,vec3(64.)))/log2(1921.);',
      'vec3 displayRGB=texture(podViewLut,(t*63.+.5)/64.).rgb;',
      'gl_FragColor.rgb=sRGBTransferEOTF(vec4(displayRGB,1.)).rgb;',
      '#endif'
    ].join('\n');
    shader.fragmentShader=frag.replace('#include <tonemapping_fragment>',display);
  };
  mat.customProgramCacheKey=()=> 'pod-lighting-v7-'+kind+(sampled?'-diffuse':'-pbr')+(extraDiffuse?'-lamp':'')+(directSpec?'-spec':'');
  mat.needsUpdate=true;
}
