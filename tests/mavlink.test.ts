import { describe, it, expect } from 'vitest';
import { MavlinkV2Framer, MavlinkMsgId, MAVLINK_V2_MAGIC } from '../src/mavlink/mavlink_v2.ts';

describe('MAVLink v2 Protocol Engine', () => {
  it('should encode HEARTBEAT packet with valid MAVLink v2 framing', () => {
    const framer = new MavlinkV2Framer(1, 1);
    const packet = framer.encodeHeartbeat();

    expect(packet[0]).toBe(MAVLINK_V2_MAGIC); // 0xFD
    expect(packet[1]).toBe(9); // 9-byte payload length
    expect(packet[5]).toBe(1); // System ID = 1
    expect(packet[6]).toBe(1); // Component ID = 1
    expect(packet[7]).toBe(MavlinkMsgId.HEARTBEAT);
  });

  it('should calculate valid CRC-16 X.25 and successfully parse encoded ATTITUDE frame', () => {
    const framer = new MavlinkV2Framer(1, 1);
    const attitudePkt = framer.encodeAttitude(1000, 0.1, -0.05, 1.57, 0.01, 0.02, 0.03);

    const parsed = framer.parse(attitudePkt);
    expect(parsed).not.toBeNull();
    expect(parsed?.msgId).toBe(MavlinkMsgId.ATTITUDE);
    expect(parsed?.payload.length).toBe(28);

    const view = new DataView(parsed!.payload.buffer, parsed!.payload.byteOffset, parsed!.payload.byteLength);
    expect(view.getUint32(0, true)).toBe(1000);
    expect(view.getFloat32(4, true)).toBeCloseTo(0.1, 4);
    expect(view.getFloat32(8, true)).toBeCloseTo(-0.05, 4);
    expect(view.getFloat32(12, true)).toBeCloseTo(1.57, 4);
  });

  it('should reject corrupted MAVLink frames with invalid CRC', () => {
    const framer = new MavlinkV2Framer(1, 1);
    const packet = framer.encodeHeartbeat();

    // Corrupt one byte of payload
    packet[12] ^= 0xFF;

    const parsed = framer.parse(packet);
    expect(parsed).toBeNull();
  });
});
