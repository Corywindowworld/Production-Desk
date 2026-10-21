import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,server:{hmr:false}});
const {cameraHasLight,setCameraLight}=await vite.ssrLoadModule('/lib/camera-light.ts');
test.after(()=>vite.close());
test('camera light switches on and off without replacing focus constraints',async()=>{let enabled=false;const calls=[],track={getCapabilities:()=>({torch:true}),applyConstraints:async v=>{calls.push(v);enabled=v.advanced[0].torch;},getSettings:()=>({torch:enabled})};assert.equal(cameraHasLight(track),true);assert.equal(await setCameraLight(track,true),true);assert.equal(await setCameraLight(track,false),false);assert.deepEqual(calls,[{advanced:[{torch:true}]},{advanced:[{torch:false}]}]);});
test('unsupported and ignored torch requests report failure instead of showing light on',async()=>{await assert.rejects(()=>setCameraLight({getCapabilities:()=>({})},true),/not supported/);await assert.rejects(()=>setCameraLight({getCapabilities:()=>({torch:true}),applyConstraints:async()=>{},getSettings:()=>({torch:false})},true),/could not switch/);});
