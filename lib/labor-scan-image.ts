/** Remove long form rules before OCR without replacing short character strokes. */
export function clearLaborRules(data:Uint8ClampedArray,width:number,height:number){
 const dark=(x:number,y:number)=>{const i=(y*width+x)*4;return data[i]+data[i+1]+data[i+2]<450;};
 const erase=new Uint8Array(width*height);
 for(let y=0;y<height;y++){let start=-1;for(let x=0;x<=width;x++){if(x<width&&dark(x,y)){if(start<0)start=x;}else{if(start>=0&&x-start>width*.22)for(let k=start;k<x;k++)erase[y*width+k]=1;start=-1;}}}
 for(let x=0;x<width;x++){let start=-1;for(let y=0;y<=height;y++){if(y<height&&dark(x,y)){if(start<0)start=y;}else{if(start>=0&&y-start>height*.12)for(let k=start;k<y;k++)erase[k*width+x]=1;start=-1;}}}
 for(let i=0;i<erase.length;i++)if(erase[i]){data[i*4]=255;data[i*4+1]=255;data[i*4+2]=255;}
 return data;
}
