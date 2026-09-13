package kr.threechan.photo;

import android.Manifest;
import android.os.Build;
import android.content.pm.PackageManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name="PhotoBackup",permissions={
    @Permission(alias="images",strings={"android.permission.READ_MEDIA_IMAGES","android.permission.ACCESS_MEDIA_LOCATION"}),
    @Permission(alias="legacy",strings={"android.permission.READ_EXTERNAL_STORAGE","android.permission.ACCESS_MEDIA_LOCATION"})
})
public class PhotoBackupPlugin extends Plugin {
    static boolean canRead(android.content.Context c){return c.checkSelfPermission(Build.VERSION.SDK_INT>=33?"android.permission.READ_MEDIA_IMAGES":"android.permission.READ_EXTERNAL_STORAGE")==PackageManager.PERMISSION_GRANTED && (Build.VERSION.SDK_INT<29 || c.checkSelfPermission("android.permission.ACCESS_MEDIA_LOCATION")==PackageManager.PERMISSION_GRANTED);}
    @PluginMethod public void configure(PluginCall call){
        boolean enabled=call.getBoolean("enabled",false);
        if(enabled&&!canRead(getContext())){requestPermissionForAlias(Build.VERSION.SDK_INT>=33?"images":"legacy",call,"permissionResult");return;}
        apply(call);
    }
    @PermissionCallback private void permissionResult(PluginCall call){
        if(!canRead(getContext())){call.reject("원본 자동 백업에는 모든 사진과 촬영 위치 정보 접근 권한이 필요해요. 선택한 사진만 허용한 경우 사진 선택해서 백업을 이용해 주세요.");return;}
        apply(call);
    }
    private void apply(PluginCall call){
        boolean enabled=call.getBoolean("enabled",false);
        String source=call.getString("sourceId","");
        if(enabled&&!source.matches("[a-f0-9-]{36}")){call.reject("백업 대상 폴더를 선택해 주세요.");return;}
        BackgroundSyncWorker.prefs(getContext()).edit().putBoolean("wifiOnly",call.getBoolean("wifiOnly",true)).putString("sourceId",source).apply();
        BackgroundSyncWorker.configure(getContext(),enabled);
        JSObject result=new JSObject();result.put("enabled",enabled);call.resolve(result);
    }
    @PluginMethod public void status(PluginCall call){
        call.resolve(readStatus(getContext()));
    }
    static JSObject readStatus(android.content.Context context){
        var prefs=BackgroundSyncWorker.prefs(context);JSObject result=new JSObject();
        result.put("enabled",prefs.getBoolean("enabled",false));result.put("lastSuccess",prefs.getLong("lastSuccess",0));result.put("outcome",prefs.getString("outcome","never"));result.put("permission",canRead(context));result.put("wifiOnly",prefs.getBoolean("wifiOnly",true));result.put("sourceId",prefs.getString("sourceId",""));return result;
    }
}
