self.onmessage=async({data:{ticket,bytes}})=>{
  try{
    const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const header=new DataView(raw), width=header.getUint16(4,true),height=header.getUint16(6,true);
    const two=header.getUint32(0,false)===0x5a313646;
    if(!two&&header.getUint32(0,false)!==0x4c554d38)throw Error('Unknown pixel format');
    const pixels=width*height,low=new Uint8Array(raw,8,pixels);
    if(raw.byteLength!==8+pixels*(two?2:1))throw Error('Invalid pixel dimensions');
    let out;
    if(two){
      const high=new Uint8Array(raw,8+pixels,pixels);out=new Uint16Array(pixels);
      for(let y=0,k=0;y<height;y++){let prev=0;for(let x=0;x<width;x++,k++){prev=(prev+(low[k]|high[k]<<8))&65535;out[k]=prev;}}
    }else{
      out=new Uint8Array(pixels);
      for(let y=0,k=0;y<height;y++){let prev=0;for(let x=0;x<width;x++,k++){prev=(prev+low[k])&255;out[k]=prev;}}
    }
    self.postMessage({ticket,width,height,two,buffer:out.buffer},[out.buffer]);
  }catch(err){self.postMessage({ticket,error:String(err)});}
};
