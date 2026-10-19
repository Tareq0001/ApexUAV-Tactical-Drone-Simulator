/**
 * MAVLink v2 Binary Protocol Framer & Serializer
 * STANAG 4586 & ArduPilot/PX4 Compatible (CRC-16-CCITT / X.25)
 */

export const MAVLINK_V2_MAGIC = 0xFD;

export enum MavlinkMsgId {
  HEARTBEAT = 0,
  SYS_STATUS = 1,
  ATTITUDE = 30,
  GLOBAL_POSITION_INT = 33,
  COMMAND_LONG = 76
}

// MAVLink CRC-Extra Seed Table (Message Specification)
export const MAVLINK_CRC_EXTRA: Record<number, number> = {
  [MavlinkMsgId.HEARTBEAT]: 50,
  [MavlinkMsgId.SYS_STATUS]: 124,
  [MavlinkMsgId.ATTITUDE]: 39,
  [MavlinkMsgId.GLOBAL_POSITION_INT]: 104,
  [MavlinkMsgId.COMMAND_LONG]: 152
};

export class MavlinkCRC {
  /**
   * X.25 CRC-16 Accumulator
   */
  public static accumulate(byte: number, crc: number): number {
    let tmp = (byte ^ (crc & 0xFF)) & 0xFF;
    tmp = (tmp ^ (tmp << 4)) & 0xFF;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
    return crc;
  }

  public static calculate(buffer: Uint8Array, crcExtra: number): number {
    let crc = 0xFFFF;
    // Skip magic byte (index 0), process header and payload
    for (let i = 1; i < buffer.length; i++) {
      crc = MavlinkCRC.accumulate(buffer[i], crc);
    }
    // Accumulate CRC-extra byte
    crc = MavlinkCRC.accumulate(crcExtra, crc);
    return crc;
  }
}

export interface MavlinkPacket {
  seq: number;
  sysId: number;
  compId: number;
  msgId: MavlinkMsgId;
  payload: Uint8Array;
}

export class MavlinkV2Framer {
  private seq: number = 0;
  private sysId: number = 1;
  private compId: number = 1; // MAV_COMP_ID_AUTOPILOT1

  constructor(sysId = 1, compId = 1) {
    this.sysId = sysId;
    this.compId = compId;
  }

  /**
   * Pack arbitrary payload into MAVLink v2 binary frame
   */
  public pack(msgId: MavlinkMsgId, payload: Uint8Array): Uint8Array {
    const payloadLen = payload.length;
    const headerLen = 10;
    const totalLen = headerLen + payloadLen + 2; // +2 for CRC
    const buffer = new Uint8Array(totalLen);
    const view = new DataView(buffer.buffer);

    buffer[0] = MAVLINK_V2_MAGIC;
    buffer[1] = payloadLen;
    buffer[2] = 0; // Incompatibility flags
    buffer[3] = 0; // Compatibility flags
    buffer[4] = this.seq++ % 256;
    buffer[5] = this.sysId;
    buffer[6] = this.compId;

    // 24-bit Message ID (little endian)
    buffer[7] = msgId & 0xFF;
    buffer[8] = (msgId >> 8) & 0xFF;
    buffer[9] = (msgId >> 16) & 0xFF;

    // Copy payload
    buffer.set(payload, headerLen);

    // Calculate and append CRC-16
    const crcExtra = MAVLINK_CRC_EXTRA[msgId] ?? 0;
    const crc = MavlinkCRC.calculate(buffer.subarray(0, headerLen + payloadLen), crcExtra);
    view.setUint16(headerLen + payloadLen, crc, true); // Little endian

    return buffer;
  }

  /**
   * Encode HEARTBEAT (#0)
   */
  public encodeHeartbeat(type = 1, autopilot = 12, baseMode = 209, customMode = 4, systemStatus = 4): Uint8Array {
    const payload = new Uint8Array(9);
    const view = new DataView(payload.buffer);
    view.setUint32(0, customMode, true);
    view.setUint8(4, type); // MAV_TYPE_FIXED_WING or QUADROTOR
    view.setUint8(5, autopilot); // MAV_AUTOPILOT_PX4
    view.setUint8(6, baseMode);
    view.setUint8(7, systemStatus);
    view.setUint8(8, 3); // MAVLINK_VERSION
    return this.pack(MavlinkMsgId.HEARTBEAT, payload);
  }

  /**
   * Encode ATTITUDE (#30)
   */
  public encodeAttitude(timeBootMs: number, roll: number, pitch: number, yaw: number, rollspeed: number, pitchspeed: number, yawspeed: number): Uint8Array {
    const payload = new Uint8Array(28);
    const view = new DataView(payload.buffer);
    view.setUint32(0, timeBootMs, true);
    view.setFloat32(4, roll, true);
    view.setFloat32(8, pitch, true);
    view.setFloat32(12, yaw, true);
    view.setFloat32(16, rollspeed, true);
    view.setFloat32(20, pitchspeed, true);
    view.setFloat32(24, yawspeed, true);
    return this.pack(MavlinkMsgId.ATTITUDE, payload);
  }

  /**
   * Encode GLOBAL_POSITION_INT (#33)
   */
  public encodeGlobalPositionInt(
    timeBootMs: number,
    latDeg: number,
    lonDeg: number,
    altM: number,
    relativeAltM: number,
    vx: number,
    vy: number,
    vz: number,
    hdgDeg: number
  ): Uint8Array {
    const payload = new Uint8Array(28);
    const view = new DataView(payload.buffer);
    view.setUint32(0, timeBootMs, true);
    view.setInt32(4, Math.round(latDeg * 1e7), true);
    view.setInt32(8, Math.round(lonDeg * 1e7), true);
    view.setInt32(12, Math.round(altM * 1000), true);
    view.setInt32(16, Math.round(relativeAltM * 1000), true);
    view.setInt16(20, Math.round(vx * 100), true);
    view.setInt16(22, Math.round(vy * 100), true);
    view.setInt16(24, Math.round(vz * 100), true);
    view.setUint16(26, Math.round(hdgDeg * 100), true);
    return this.pack(MavlinkMsgId.GLOBAL_POSITION_INT, payload);
  }

  /**
   * Validate and parse a binary MAVLink v2 buffer
   */
  public parse(buffer: Uint8Array): MavlinkPacket | null {
    if (buffer.length < 12 || buffer[0] !== MAVLINK_V2_MAGIC) return null;

    const payloadLen = buffer[1];
    const headerLen = 10;
    if (buffer.length < headerLen + payloadLen + 2) return null;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const seq = buffer[4];
    const sysId = buffer[5];
    const compId = buffer[6];
    const msgId = buffer[7] | (buffer[8] << 8) | (buffer[9] << 16);

    const crcExtra = MAVLINK_CRC_EXTRA[msgId] ?? 0;
    const computedCrc = MavlinkCRC.calculate(buffer.subarray(0, headerLen + payloadLen), crcExtra);
    const receivedCrc = view.getUint16(headerLen + payloadLen, true);

    if (computedCrc !== receivedCrc) {
      return null; // Corrupted frame
    }

    const payload = buffer.subarray(headerLen, headerLen + payloadLen);
    return { seq, sysId, compId, msgId, payload };
  }
}
