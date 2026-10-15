export class WorkerClient{
  constructor(){this.sequence=0;this.pending=new Map();this.start();this.checkpoint=null;}
  start(){this.worker=new Worker(new URL('../workers/analysis.worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const pending=this.pending.get(data.requestId);if(!pending)return;this.pending.delete(data.requestId);data.ok?pending.resolve(data.result):pending.reject(Object.assign(new Error(data.error.code),data.error));};this.worker.onerror=()=>{for(const p of this.pending.values())p.reject(new Error('WORKER_FAILED'));this.pending.clear();};}
  call(action,payload={}){return new Promise((resolve,reject)=>{const requestId=++this.sequence;this.pending.set(requestId,{resolve,reject});this.worker.postMessage({requestId,action,payload});});}
  async retain(){this.checkpoint=await this.call('checkpoint');await this.onRetain?.(this.checkpoint);}
  async cancel(){this.worker.terminate();for(const p of this.pending.values())p.reject(Object.assign(new Error('CANCELLED'),{code:'CANCELLED'}));this.pending.clear();this.start();if(this.checkpoint?.sources.length)return this.call('recover',this.checkpoint);return this.call('snapshot');}
}
