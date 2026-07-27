package com.cardbey.android.core.database.dao;

import android.database.Cursor;
import androidx.annotation.NonNull;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import com.cardbey.android.core.database.entity.MissionCacheEntity;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlinx.coroutines.flow.Flow;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class MissionCacheDao_Impl implements MissionCacheDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<MissionCacheEntity> __insertionAdapterOfMissionCacheEntity;

  private final SharedSQLiteStatement __preparedStmtOfDelete;

  public MissionCacheDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfMissionCacheEntity = new EntityInsertionAdapter<MissionCacheEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `mission_cache` (`missionId`,`status`,`runtimeState`,`title`,`lastEventSeq`,`updatedAt`) VALUES (?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final MissionCacheEntity entity) {
        statement.bindString(1, entity.getMissionId());
        statement.bindString(2, entity.getStatus());
        if (entity.getRuntimeState() == null) {
          statement.bindNull(3);
        } else {
          statement.bindString(3, entity.getRuntimeState());
        }
        if (entity.getTitle() == null) {
          statement.bindNull(4);
        } else {
          statement.bindString(4, entity.getTitle());
        }
        statement.bindLong(5, entity.getLastEventSeq());
        statement.bindLong(6, entity.getUpdatedAt());
      }
    };
    this.__preparedStmtOfDelete = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM mission_cache WHERE missionId = ?";
        return _query;
      }
    };
  }

  @Override
  public Object upsert(final MissionCacheEntity entity,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfMissionCacheEntity.insert(entity);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object delete(final String missionId, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDelete.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, missionId);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfDelete.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<MissionCacheEntity>> observeRecent(final int limit) {
    final String _sql = "SELECT * FROM mission_cache ORDER BY updatedAt DESC LIMIT ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, limit);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"mission_cache"}, new Callable<List<MissionCacheEntity>>() {
      @Override
      @NonNull
      public List<MissionCacheEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfMissionId = CursorUtil.getColumnIndexOrThrow(_cursor, "missionId");
          final int _cursorIndexOfStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "status");
          final int _cursorIndexOfRuntimeState = CursorUtil.getColumnIndexOrThrow(_cursor, "runtimeState");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfLastEventSeq = CursorUtil.getColumnIndexOrThrow(_cursor, "lastEventSeq");
          final int _cursorIndexOfUpdatedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAt");
          final List<MissionCacheEntity> _result = new ArrayList<MissionCacheEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final MissionCacheEntity _item;
            final String _tmpMissionId;
            _tmpMissionId = _cursor.getString(_cursorIndexOfMissionId);
            final String _tmpStatus;
            _tmpStatus = _cursor.getString(_cursorIndexOfStatus);
            final String _tmpRuntimeState;
            if (_cursor.isNull(_cursorIndexOfRuntimeState)) {
              _tmpRuntimeState = null;
            } else {
              _tmpRuntimeState = _cursor.getString(_cursorIndexOfRuntimeState);
            }
            final String _tmpTitle;
            if (_cursor.isNull(_cursorIndexOfTitle)) {
              _tmpTitle = null;
            } else {
              _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            }
            final long _tmpLastEventSeq;
            _tmpLastEventSeq = _cursor.getLong(_cursorIndexOfLastEventSeq);
            final long _tmpUpdatedAt;
            _tmpUpdatedAt = _cursor.getLong(_cursorIndexOfUpdatedAt);
            _item = new MissionCacheEntity(_tmpMissionId,_tmpStatus,_tmpRuntimeState,_tmpTitle,_tmpLastEventSeq,_tmpUpdatedAt);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
