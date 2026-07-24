package com.ragchatbot.mapper.handler;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.UUID;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

/**
 * MyBatis ↔ PostgreSQL uuid 타입 핸들러 (M7 스파이크).
 * setString은 uuid 컬럼에서 거부되므로 setObject(..., Types.OTHER)로 넘기고,
 * 결과는 getObject(col, UUID.class)로 받음. type-handlers-package로 자동 등록됨.
 */
@MappedTypes(UUID.class)
public class UuidTypeHandler extends BaseTypeHandler<UUID> {

	@Override
	public void setNonNullParameter(PreparedStatement ps, int i, UUID parameter, JdbcType jdbcType)
			throws SQLException {
		ps.setObject(i, parameter, Types.OTHER);
	}

	@Override
	public UUID getNullableResult(ResultSet rs, String columnName) throws SQLException {
		return rs.getObject(columnName, UUID.class);
	}

	@Override
	public UUID getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
		return rs.getObject(columnIndex, UUID.class);
	}

	@Override
	public UUID getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
		return cs.getObject(columnIndex, UUID.class);
	}
}
