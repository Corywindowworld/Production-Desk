// Preserve the small prepared-query interface while using PostgreSQL transactions.
export type Driver={query:(sql:string,params:unknown[])=>Promise<{rows:any[];changes:number}>;transaction:<T>(fn:(tx:Driver)=>Promise<T>)=>Promise<T>};
const tables=new Set(['jobs','members','credentials','sessions','login_limits','account_audit','installer_reports','notifications','push_subscriptions','job_visits','attachment_uploads']);
export function compileQuery(sql:string){
 let index=0;
 // SQL string literals are left untouched; query values are always separate parameters.
 return sql.replace(/'(?:''|[^'])*'|\?|\b[a-z_][a-z_0-9]*\b/gi,token=>token.startsWith("'")?token:token==='?'?'$'+(++index):tables.has(token)?'production.'+token:token);
}
export function createDatabase(driver:Driver){
 class Statement{
  constructor(readonly sql:string,readonly params:unknown[]=[]){ }
  bind(...params:unknown[]){return new Statement(this.sql,params)}
  async execute(d=driver){return d.query(compileQuery(this.sql),this.params)}
  async first(){return (await this.execute()).rows[0]??null}
  async all(){return {results:(await this.execute()).rows}}
  async run(){return {meta:{changes:(await this.execute()).changes}}}
 }
 return {prepare:(sql:string)=>new Statement(sql),async batch(statements:Statement[]){return driver.transaction(async tx=>{const results=[];for(const s of statements)results.push({meta:{changes:(await s.execute(tx)).changes}});return results})}};
}
