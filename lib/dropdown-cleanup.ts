const removedCities=new Set(['/pollo beach','beverly hi','chevallutz','clearwate','palm harb','st pete bea','ruskin','st pete','temple ter']);
export const cityChoiceKey=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
export function allowedCityChoice(value:string){return !removedCities.has(cityChoiceKey(value));}
export function cityDropdownChoices(values:string[]){const byKey=new Map<string,string>();for(const raw of values){const name=raw.trim().replace(/\s+/g,' ');if(name&&allowedCityChoice(name)&&!byKey.has(cityChoiceKey(name)))byKey.set(cityChoiceKey(name),name);}return [...byKey.values()].sort((a,b)=>a.localeCompare(b));}
