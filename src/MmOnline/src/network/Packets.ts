import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';

export class SyncStorage extends Packet {
  items: Buffer;
  masks: Buffer;

  constructor(
    lobby: string,
    inventory: Buffer,
    masks: Buffer
  ) {
    super('SyncStorage', 'MmOnline', lobby, false);
    this.items = inventory;
    this.masks = masks;
  }
}

export class SyncBuffered extends Packet {
  value: Buffer;
  constructor(lobby: string, header: string, value: Buffer, persist: boolean) {
    super(header, 'MmOnline', lobby, persist);
    this.value = value;
  }
}

export class SyncNumbered extends Packet {
  value: number;
  constructor(lobby: string, header: string, value: number, persist: boolean) {
    super(header, 'MmOnline', lobby, persist);
    this.value = value;
  }
}