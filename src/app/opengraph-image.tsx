import {ImageResponse} from 'next/og';
export const alt='Roya Food Products — Finger food and homemade food in Tehran';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function Image(){return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:90,background:'#FAF6EE',color:'#2B2B2B',borderBottom:'24px solid #4A7C59'}}><div style={{display:'flex',fontSize:32,letterSpacing:7,color:'#8B5E3C'}}>ROYA FOOD PRODUCTS</div><div style={{display:'flex',fontSize:88,fontWeight:700,marginTop:30,color:'#355C41'}}>Made for your table.</div><div style={{display:'flex',fontSize:34,marginTop:28}}>Finger food · Snack platters · Homemade food</div><div style={{display:'flex',fontSize:28,marginTop:55,color:'#4A7C59'}}>royahealthyfood.ir · Tehran</div></div>,size);}
