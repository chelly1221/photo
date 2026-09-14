package kr.threechan.photo;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import android.webkit.WebView;
import java.lang.ref.WeakReference;

/** Only photo/video IDs obtained from MediaStore are readable. No arbitrary URI/path bridge. */
public final class PhotoMedia {
    private final Context context;
    private final Map<String,Uri> permitted = new HashMap<>();
    private final Map<String,String> versions = new HashMap<>();
    private final WeakReference<WebView> view;
    private String source="";
    private volatile boolean closed;
    void close(){closed=true;}
    PhotoMedia(Context context,WebView view){this.context=context.getApplicationContext();this.view=new WeakReference<>(view);}
    @JavascriptInterface public void listAsync(String requestId){
        if(!requestId.matches("[a-f0-9-]{36}"))return;
        new Thread(()->{
            JSONObject response=new JSONObject();try{response.put("id",requestId);response.put("items",new JSONArray(list()));}catch(Exception e){try{response.put("error",e.getMessage()==null?"사진 접근 권한을 확인해 주세요.":e.getMessage());}catch(Exception ignored){}}
            WebView target=view.get();if(target!=null)target.post(()->target.evaluateJavascript("window.dispatchEvent(new CustomEvent('photo-native-result',{detail:"+response.toString()+"}))",null));
        },"photo-media-read").start();
    }
    private SQLiteDatabase database(){
        SQLiteDatabase db=context.openOrCreateDatabase("photo-backup-ledger",Context.MODE_PRIVATE,null);
        db.execSQL("CREATE TABLE IF NOT EXISTS completed(id TEXT PRIMARY KEY,version TEXT NOT NULL)");return db;
    }
    private boolean enabled(){return !closed&&BackgroundSyncWorker.enabled(context);}
    @JavascriptInterface public String configuration(){
        try{return new JSONObject().put("enabled",enabled()).put("sourceId",BackgroundSyncWorker.prefs(context).getString("sourceId","")).toString();}
        catch(Exception error){return "{}";}
    }
    @JavascriptInterface public synchronized String list(){
        JSONArray result=new JSONArray();if(!enabled())return result.toString();
        if(BackgroundSyncWorker.prefs(context).getBoolean("wifiOnly",true)){
            android.net.ConnectivityManager network=context.getSystemService(android.net.ConnectivityManager.class);
            android.net.NetworkCapabilities capabilities=network.getNetworkCapabilities(network.getActiveNetwork());
            if(capabilities==null||!capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI))throw new IllegalStateException("Wi-Fi 연결을 기다리고 있어요.");
        }
        permitted.clear();versions.clear();
        source=BackgroundSyncWorker.prefs(context).getString("sourceId","");
        String[] columns={MediaStore.Files.FileColumns._ID,MediaStore.Files.FileColumns.DISPLAY_NAME,MediaStore.Files.FileColumns.SIZE,MediaStore.Files.FileColumns.DATE_MODIFIED,MediaStore.Files.FileColumns.MEDIA_TYPE};
        try(SQLiteDatabase db=database();Cursor cursor=context.getContentResolver().query(MediaStore.Files.getContentUri("external"),columns,MediaStore.Files.FileColumns.MEDIA_TYPE+" IN (?,?)",new String[]{"1","3"},MediaStore.Files.FileColumns.DATE_ADDED+" ASC")){
            if(cursor==null)return result.toString();
            long batchBytes=0;
            while(cursor.moveToNext()&&result.length()<12){
                long id=cursor.getLong(0),size=cursor.getLong(2),modified=cursor.getLong(3);String key=Long.toString(id),version=size+":"+modified;
                boolean video=cursor.getInt(4)==MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
                if(size<=0||size>(video?2L*1024*1024*1024:250L*1024*1024))continue;
                String filename=cursor.getString(1);if(!MediaFormats.supports(filename))continue;
                try(Cursor done=db.rawQuery("SELECT version FROM completed WHERE id=?",new String[]{source+":"+key})){if(done.moveToFirst()&&version.equals(done.getString(0)))continue;}
                if(result.length()>0&&batchBytes+size>128L*1024*1024)break;
                Uri uri=ContentUris.withAppendedId(video?MediaStore.Video.Media.EXTERNAL_CONTENT_URI:MediaStore.Images.Media.EXTERNAL_CONTENT_URI,id);
                if(!video&&Build.VERSION.SDK_INT>=29&&context.checkSelfPermission("android.permission.ACCESS_MEDIA_LOCATION")==android.content.pm.PackageManager.PERMISSION_GRANTED)uri=MediaStore.setRequireOriginal(uri);
                MessageDigest hash=MessageDigest.getInstance("SHA-256");
                try(InputStream input=context.getContentResolver().openInputStream(uri)){
                    if(input==null)continue;byte[] buffer=new byte[65536];int read;while((read=input.read(buffer))!=-1){if(!enabled())return result.toString();hash.update(buffer,0,read);}
                }
                StringBuilder digest=new StringBuilder();for(byte b:hash.digest())digest.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
                permitted.put(key,uri);versions.put(key,version);
                batchBytes+=size;
                result.put(new JSONObject().put("id",key).put("name",cursor.getString(1)).put("bytes",size).put("digest",digest.toString()));
            }
        }catch(Exception e){throw new IllegalStateException("사진 접근 권한과 저장 공간을 확인해 주세요.");}
        return result.toString();
    }
    @JavascriptInterface public synchronized String read(String id,long offset,int length){
        if(!enabled()||!source.equals(BackgroundSyncWorker.prefs(context).getString("sourceId",""))||!permitted.containsKey(id)||offset<0||length<1||length>1024*1024)throw new SecurityException("사진 전송 범위가 올바르지 않아요.");
        try(InputStream input=context.getContentResolver().openInputStream(permitted.get(id))){
            if(input==null)throw new IOException();long remaining=offset;while(remaining>0){long skipped=input.skip(remaining);if(skipped<=0){if(input.read()<0)throw new EOFException();skipped=1;}remaining-=skipped;}
            byte[] data=new byte[length];int total=0;while(total<length){int n=input.read(data,total,length-total);if(n<0)break;total+=n;}
            return Base64.encodeToString(data,0,total,Base64.NO_WRAP);
        }catch(IOException e){throw new IllegalStateException("사진 파일을 읽지 못했어요.");}
    }
    @JavascriptInterface public synchronized void complete(String id){
        if(!enabled()||!source.equals(BackgroundSyncWorker.prefs(context).getString("sourceId",""))||!versions.containsKey(id))throw new SecurityException();
        try(SQLiteDatabase db=database()){db.execSQL("INSERT OR REPLACE INTO completed(id,version) VALUES(?,?)",new Object[]{source+":"+id,versions.get(id)});}
        permitted.remove(id);versions.remove(id);
    }
}
