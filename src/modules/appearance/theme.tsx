'use client';
import {useSyncExternalStore} from 'react';
const storageKey='siliantai-theme';
type ThemePreference='light'|'dark'|'system';
function normalize(value:string|null|undefined):ThemePreference{return value==='light'||value==='dark'?value:'system';}
function snapshot():ThemePreference{return normalize(document.documentElement.dataset.themePreference);}
function apply(preference:ThemePreference){document.documentElement.dataset.themePreference=preference;document.documentElement.dataset.theme=preference==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference;}
function subscribe(listener:()=>void){
 const media=matchMedia('(prefers-color-scheme: dark)');
 const syncStorage=()=>{let preference:ThemePreference=snapshot();try{preference=normalize(localStorage.getItem(storageKey));}catch{}apply(preference);listener();};
 const onStorage=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null)syncStorage();};
 const onSystem=()=>{if(snapshot()==='system'){apply('system');listener();}};
 window.addEventListener('siliantai:theme',listener);window.addEventListener('storage',onStorage);media.addEventListener('change',onSystem);syncStorage();
 return()=>{window.removeEventListener('siliantai:theme',listener);window.removeEventListener('storage',onStorage);media.removeEventListener('change',onSystem);};
}
function choose(preference:ThemePreference){apply(preference);try{localStorage.setItem(storageKey,preference);}catch{}window.dispatchEvent(new Event('siliantai:theme'));}
export function ThemeSwitcher(){const preference=useSyncExternalStore(subscribe,snapshot,():ThemePreference=>'system');return <div className="theme-switcher" role="group" aria-label="外观主题">
 <button type="button" aria-pressed={preference==='light'} onClick={()=>choose('light')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>浅色</button>
 <button type="button" aria-pressed={preference==='dark'} onClick={()=>choose('dark')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>深色</button>
 <button type="button" aria-pressed={preference==='system'} onClick={()=>choose('system')}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>跟随系统</button>
 </div>;}
