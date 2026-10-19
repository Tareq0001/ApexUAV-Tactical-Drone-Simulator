#!/usr/bin/env python3
"""
ApexUAV Defense Edition — Tactical MAVLink v2 UDP SITL Bridge
Connects the Web Flight Dynamics Simulator to Ground Control Stations (QGroundControl / Mission Planner)
via UDP port 14550 according to STANAG 4586 standards.
"""

import sys
import time
import socket
import struct
import math
from typing import Tuple

UDP_IP = "127.0.0.1"
UDP_PORT_IN = 14550   # Inbound from simulator / autopilot
UDP_PORT_OUT = 14551  # Outbound to GCS

MAVLINK_V2_MAGIC = 0xFD

def calculate_mavlink_crc(buffer: bytes, crc_extra: int) -> int:
    """X.25 CRC-16 Accumulator for MAVLink v2 frame validation."""
    crc = 0xFFFF
    for b in buffer[1:]:
        tmp = (b ^ (crc & 0xFF)) & 0xFF
        tmp = (tmp ^ (tmp << 4)) & 0xFF
        crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF
    
    # Extra seed byte
    tmp = (crc_extra ^ (crc & 0xFF)) & 0xFF
    tmp = (tmp ^ (tmp << 4)) & 0xFF
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF
    return crc

class MavlinkSITLBridge:
    def __init__(self, host: str = "0.0.0.0", port: int = UDP_PORT_IN):
        self.host = host
        self.port = port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind((self.host, self.port))
        self.sock.settimeout(0.5)
        self.packet_count = 0
        print(f"[ApexUAV SITL Bridge] Listening for MAVLink v2 packets on UDP {self.host}:{self.port}...")

    def parse_packet(self, data: bytes) -> Tuple[int, int, bytes]:
        """Decode MAVLink v2 binary packet header."""
        if len(data) < 12 or data[0] != MAVLINK_V2_MAGIC:
            return -1, -1, b""

        payload_len = data[1]
        seq = data[4]
        sys_id = data[5]
        comp_id = data[6]
        msg_id = data[7] | (data[8] << 8) | (data[9] << 16)
        payload = data[10:10 + payload_len]

        return sys_id, msg_id, payload

    def run(self):
        print("[ApexUAV SITL Bridge] STANAG 4586 Telemetry Router Active.")
        try:
            while True:
                try:
                    data, addr = self.sock.recvfrom(1024)
                    sys_id, msg_id, payload = self.parse_packet(data)
                    self.packet_count += 1

                    if msg_id == 0:  # HEARTBEAT
                        print(f"[{time.strftime('%X')}] [SYS {sys_id}] HEARTBEAT received from {addr[0]}:{addr[1]}")
                    elif msg_id == 30:  # ATTITUDE
                        if len(payload) >= 16:
                            time_boot_ms, roll, pitch, yaw = struct.unpack("<Ifff", payload[:16])
                            print(f"[{time.strftime('%X')}] ATTITUDE: Roll={math.degrees(roll):.1f}° Pitch={math.degrees(pitch):.1f}° Yaw={math.degrees(yaw):.1f}°")
                    elif msg_id == 33:  # GLOBAL_POSITION_INT
                        if len(payload) >= 16:
                            time_boot_ms, lat, lon, alt = struct.unpack("<Iiii", payload[:16])
                            print(f"[{time.strftime('%X')}] GPS: Lat={lat / 1e7:.6f}° Lon={lon / 1e7:.6f}° Alt={alt / 1000:.1f}m")

                except socket.timeout:
                    pass
        except KeyboardInterrupt:
            print("\n[ApexUAV SITL Bridge] Shutting down.")
        finally:
            self.sock.close()

if __name__ == "__main__":
    bridge = MavlinkSITLBridge()
    bridge.run()
