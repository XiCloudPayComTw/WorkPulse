/**
 * Shared attendance route activation: initial deep links and later navigation.
 * Handles an unexpected loader rejection instead of leaking unhandled promises.
 */
export function shouldLoadAttendance({view,isCloud,cloudPhase}){
 return view==='attendance'&&(!isCloud||cloudPhase==='ready');
}
export async function activateAttendance({load,render,isActive,onError=()=>{}}){
 if(!isActive())return false;
 try{
  const task=load();
  render(); // reflect the synchronous transition into loading
  try{
   await task;
   return true;
  }catch(error){
   onError(error);
   return false;
  }finally{
   if(isActive())render();
  }
 }catch(error){
  onError(error);
  if(isActive())render();
  return false;
 }
}
