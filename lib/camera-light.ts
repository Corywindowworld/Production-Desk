export function cameraHasLight(track:MediaStreamTrack){try{return (track.getCapabilities?.() as any)?.torch===true;}catch{return false;}}
export async function setCameraLight(track:MediaStreamTrack,on:boolean){
 if(!cameraHasLight(track))throw Error('Camera light is not supported on this device or browser. Use brighter lighting or a barcode photo.');
 await track.applyConstraints({advanced:[{torch:on} as any]});
 const actual=(track.getSettings?.() as any)?.torch;
 if(typeof actual==='boolean'&&actual!==on)throw Error('The camera could not switch its light. Try again or use brighter lighting.');
 return on;
}
