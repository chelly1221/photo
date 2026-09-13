import {describe,it,expect} from 'vitest';
import {drainBackupQueue} from '../src/lib/backup-queue';
describe('phone backup queue',()=>{
  it('drains more than one native batch before reporting completion',async()=>{
    const pending=Array.from({length:29},(_,i)=>i);const completed:number[]=[];
    const result=await drainBackupQueue({list:async()=>pending.slice(0,12),process:async(item)=>{completed.push(item);pending.splice(pending.indexOf(item),1);}});
    expect(result).toEqual({completed:29,pending:false});expect(new Set(completed).size).toBe(29);expect(pending).toEqual([]);
  });
  it('reports pending work at the background deadline and can continue without duplicates',async()=>{
    const pending=Array.from({length:25},(_,i)=>i);let time=0;
    const options={list:async()=>pending.slice(0,12),process:async(item:number)=>{pending.splice(pending.indexOf(item),1);time+=4;},now:()=>time};
    const first=await drainBackupQueue({...options,budgetMs:10});expect(first).toEqual({completed:3,pending:true});
    const rest=await drainBackupQueue(options);expect(rest).toEqual({completed:22,pending:false});
  });
});
