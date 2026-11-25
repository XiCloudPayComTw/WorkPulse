/**
 * Unified route activation for attendance.
 *
 * A direct refresh at #/attendance must be hydrated just like a navigation click.
 * During Google Apps Script bootstrap, wait for the employee roster to finish loading.
 */
export function shouldLoadAttendance({view,isCloud,cloudPhase}){
 return view==='attendance'&&(!isCloud||cloudPhase==='ready');
}
export async function activateAttendance({load,render,isActive}){
 if(!isActive())return false;
 const task=load();
 render(); // paint the pending status after load() synchronously enters loading state
 try {await task;}
 finally {if(isActive())render();}
 return true;
}
