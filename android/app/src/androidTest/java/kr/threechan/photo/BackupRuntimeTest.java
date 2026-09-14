package kr.threechan.photo;
import android.content.Context;
import androidx.work.*;
import android.content.Intent;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.work.NetworkType;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BackupRuntimeTest {
    private Context context;
    @Before public void setup(){context=InstrumentationRegistry.getInstrumentation().getTargetContext();BackgroundSyncWorker.prefs(context).edit().clear().commit();}
    @After public void cleanup(){BackgroundSyncWorker.configure(context,false);BackgroundSyncWorker.prefs(context).edit().clear().commit();}
    @Test public void wifiSettingAndTargetSurviveStatusReconstruction() throws Exception {
        BackgroundSyncWorker.prefs(context).edit().putBoolean("wifiOnly",false).putString("sourceId","test-source").commit();
        var state=PhotoBackupPlugin.readStatus(context);
        assertFalse(state.getBoolean("wifiOnly"));assertEquals("test-source",state.getString("sourceId"));
        assertEquals(NetworkType.CONNECTED,BackgroundSyncWorker.constraints(context).getRequiredNetworkType());
        BackgroundSyncWorker.prefs(context).edit().putBoolean("wifiOnly",true).commit();
        assertTrue(PhotoBackupPlugin.readStatus(context).getBoolean("wifiOnly"));
        assertEquals(NetworkType.UNMETERED,BackgroundSyncWorker.constraints(context).getRequiredNetworkType());
    }
    @Test public void bundledWorkerRunsWithoutActivityAndSkipsUnconfiguredBackup() throws Exception {
        BackgroundSyncWorker.foreground(false);
        BackgroundSyncWorker.prefs(context).edit().putBoolean("enabled",true).commit();
        OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(BackgroundSyncWorker.class).build();
        WorkManager manager=WorkManager.getInstance(context);
        manager.enqueue(request).getResult().get();
        long deadline=System.currentTimeMillis()+45000;
        WorkInfo info=null;
        while(System.currentTimeMillis()<deadline){
            info=manager.getWorkInfoById(request.getId()).get();
            if(info!=null&&info.getState().isFinished())break;
            android.os.SystemClock.sleep(200);
        }
        assertNotNull(info);
        assertEquals(WorkInfo.State.SUCCEEDED,info.getState());
        assertTrue(BackgroundSyncWorker.prefs(context).getLong("lastAttempt",0)>0);
        assertEquals("skipped",BackgroundSyncWorker.prefs(context).getString("outcome",""));
        assertEquals(0,BackgroundSyncWorker.prefs(context).getLong("lastSuccess",0));
    }
    @Test public void mediaBridgeCannotReadArbitraryId(){
        PhotoMedia bridge=new PhotoMedia(context,null);
        assertEquals("[]",bridge.list());
        try{bridge.read("../../../private",0,1024);fail("Arbitrary file read must fail");}catch(SecurityException expected){}
    }
    @Test public void authBrowserRejectsForeignOrigins(){
        assertFalse(AuthBrowserPlugin.isAllowedUrl("https://example.com/a/login"));
        assertFalse(AuthBrowserPlugin.isAllowedUrl("https://login.tailscale.com@example.com/a/login"));
        assertTrue(AuthBrowserPlugin.isAllowedUrl("https://login.tailscale.com/a/test"));
    }
    @Test public void continuationKeepsNetworkRulesWithoutAnArtificialWait(){
        BackgroundSyncWorker.prefs(context).edit().putBoolean("wifiOnly",true).commit();
        var request=BackgroundSyncWorker.continuation(context).getWorkSpec();
        assertEquals(NetworkType.UNMETERED,request.constraints.getRequiredNetworkType());
        assertEquals(0L,request.initialDelay);
        assertFalse(request.constraints.requiresBatteryNotLow());
    }
    @Test public void supportedMediaIncludesRawAndVideoAndUsesNativeSettings() throws Exception {
        assertTrue(MediaFormats.supports("IMG.CR3"));assertTrue(MediaFormats.supports("clip.MOV"));
        assertFalse(MediaFormats.supports("script.exe"));
        BackgroundSyncWorker.prefs(context).edit().putBoolean("enabled",true).putString("sourceId","native-source").commit();
        var settings=new org.json.JSONObject(new PhotoMedia(context,null).configuration());
        assertTrue(settings.getBoolean("enabled"));assertEquals("native-source",settings.getString("sourceId"));
    }
 @Test public void rebootAndUpdateRestoreMissingWorkWithoutEnablingSignedOutAccounts()throws Exception{
  WorkManager manager=WorkManager.getInstance(context);
  BackgroundSyncWorker.foreground(true);
  BackgroundSyncWorker.configure(context,false);
  manager.cancelUniqueWork(BackgroundSyncWorker.PERIODIC).getResult().get();
  manager.cancelUniqueWork(BackgroundSyncWorker.SOON).getResult().get();
  assertNull(BackgroundSyncReceiver.restore(context,Intent.ACTION_BOOT_COMPLETED));
  assertFalse(BackgroundSyncWorker.enabled(context));
  BackgroundSyncWorker.prefs(context).edit().putBoolean("enabled",true).commit();
  assertNull(BackgroundSyncReceiver.restore(context,"unrelated.action"));
  BackgroundSyncReceiver.restore(context,Intent.ACTION_BOOT_COMPLETED).getResult().get();
  BackgroundSyncReceiver.restore(context,Intent.ACTION_MY_PACKAGE_REPLACED).getResult().get();
  assertEquals(1,manager.getWorkInfosForUniqueWork(BackgroundSyncWorker.PERIODIC).get().stream().filter(w->!w.getState().isFinished()).count());
  assertFalse(manager.getWorkInfosForUniqueWork(BackgroundSyncWorker.SOON).get().isEmpty());
  assertTrue(manager.getWorkInfosForUniqueWork(BackgroundSyncWorker.SOON).get().stream().filter(w->!w.getState().isFinished()).count()<=1);
 }
}
