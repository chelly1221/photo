package kr.threechan.photo;
import android.content.Context;
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
}
