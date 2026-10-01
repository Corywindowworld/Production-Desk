import React, {useEffect, useRef, useState} from 'react';
import {AppState, Button, Linking, SafeAreaView, StyleSheet, Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {WebView} from 'react-native-webview';
import {ORIGIN, checkTracking, startTracking, stopTracking, subscribe} from './tracking';

export default function App() {
 const web=useRef<WebView>(null),url=useRef(ORIGIN),[blocked,setBlocked]=useState('');
 const trusted=(value:string)=>{try{return new URL(value).origin===ORIGIN}catch{return false}};
 useEffect(()=>{
  const off=subscribe(d=>{
   if(d.status==='blocked')setBlocked(d.message||'Location sharing is required.');
   if(d.status==='ready')setBlocked('');
   if(d.status==='denied')setBlocked('');
   if(trusted(url.current))web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('production-location',{detail:${JSON.stringify(d)}}));${d.status==='denied'?"window.location.replace('/login');":''}true;`);
  });
  const state=AppState.addEventListener('change',s=>{if(s==='active')void checkTracking()});
  const timer=setInterval(()=>{if(AppState.currentState==='active')void checkTracking()},15000);
  void checkTracking();return()=>{off();state.remove();clearInterval(timer)};
 },[]);
 return <SafeAreaView style={styles.root}><StatusBar style="dark"/><WebView ref={web} source={{uri:ORIGIN}} style={styles.root}
  originWhitelist={[ORIGIN]} sharedCookiesEnabled thirdPartyCookiesEnabled={false} javaScriptEnabled
  geolocationEnabled={false} allowsBackForwardNavigationGestures
  onShouldStartLoadWithRequest={r=>{if(trusted(r.url))return true;if(/^(https:|mailto:|tel:)/.test(r.url))void Linking.openURL(r.url);return false}}
  onNavigationStateChange={s=>{url.current=s.url;if(trusted(s.url)&&new URL(s.url).pathname==='/login')void stopTracking()}}
  onMessage={async e=>{if(!trusted(e.nativeEvent.url))return;try{const d=JSON.parse(e.nativeEvent.data);if(d.type==='start-location')await startTracking(d.token,d.expires);else if(d.type==='stop-location')await stopTracking();}catch(err){setBlocked((err as Error).message)}}}
  onLoadEnd={()=>{void checkTracking()}}
 />{blocked&&<View style={styles.block}><Text style={styles.title}>Location sharing required</Text><Text>{blocked}</Text><Button title="Retry connection" onPress={()=>void checkTracking()}/><Button title="Stop sharing & sign out" onPress={()=>void stopTracking()}/><Button title="Open phone settings" onPress={()=>void Linking.openSettings()}/></View>}</SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#fff'},block:{...StyleSheet.absoluteFillObject,backgroundColor:'#fff4dd',padding:28,justifyContent:'center',gap:18},title:{fontSize:24,fontWeight:'700',color:'#16385b'}});
