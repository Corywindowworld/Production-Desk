// LS-2500, Revised 1-20-2022. Rates transcribed from the supplied Tampa Bay labor sheet.
export const laborTemplateRows:[string,number|null][]=[
 ['Install 2-Lite Slider > 114 U.I. Add',20],['Remove Steel Window',20],['Install 3-Lite Slider Add',40],['Installation - Standard',86],['Recess Opening (Re-Buck)',25],['Install Custom Int/Ext Trim',15],['2nd Story Charge',5],['Install Exterior Capping',27],['Bay Window Finish & Trim',150],['Header Flashing (Req for Siding)',5],['Repair Sill OR Jamb (Per Ft)',3],['Structural Mullion for Multi-Unit',35],['Replace Interior Marble Sill',25],['Replace Exterior Concrete Sill',115],['Install Pocket Door',400],['Sliding Door Installation - Frame',150],['SPD Panel Installation (PP) Add',50],["SPD Panel 8' Tall (PP) Add",15],['SPD Panel IMPACT (PP) Add',25],['IMPACT Window - Add',20],['Entry Door and Replace Trim',285],['French Door and Replace Trim',485],['Sidelite / Transom',75],['3100/6000 Series Trim',8],['Cutback Concrete Slab Door',180],['Miscellaneous Labor',null],['Trip Charge',null]
];
export const blankLaborTemplate=()=>laborTemplateRows.map(([description,rate])=>({description,contract:0,rate,actual:0,reason:'',extra:false}));
export const laborQuestions=[
 'Did you get a signed completion certificate?',
 'Did you collect the balance due on the job, or get AG completion & customer call to AG?',
 'Did you physically identify each model window and CONFIRM the corresponding install instructions are in the Permit Pack?'
];
export const laborTruckItems=['Yard Signs','Drop Cloth','Trim & Caulk','Parts','Vacuum','Spray Foam'];
export const laborAgreement="I agree to perform all work in a professional manner. I understand that I am responsible for all taxes, Worker's Comp and General Liability related to this contract. Upon payment of this job according to my subcontractor agreement with Window World, I hereby waive any worker's lien rights I may have. I guarantee my work for two full years and agree to repair any defects during that period at no additional cost to Window World or Customer.";
export function templateDetailsValid(lines:any[]){return lines.length>=laborTemplateRows.length&&laborTemplateRows.every(([description,rate],i)=>lines[i].description===description&&lines[i].contract===0&&(rate===null||lines[i].rate===rate));}
