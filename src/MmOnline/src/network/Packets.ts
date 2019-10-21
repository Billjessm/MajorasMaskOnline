import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';

export class SyncStorage extends Packet {
  game_flags: Buffer;
  cycle_flags: Buffer;
  scene_data: any;
  items: Buffer;
  masks: Buffer;

  constructor(
    lobby: string,
    game_flags: Buffer,
    cycle_flags: Buffer,
    scene_data: any,
    inventory: Buffer,
    masks: Buffer,
  ) {
    super('SyncStorage', 'MmOnline', lobby, false);
    this.game_flags = game_flags;
    this.cycle_flags = cycle_flags;
    this.items = inventory;
    this.masks = masks;
    this.scene_data = scene_data;
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

export class SyncSceneData extends Packet {
  scene: number;
  flags: Buffer;
  constructor(lobby: string, header: string, scene: number, flags: Buffer, persist: boolean) {
    super(header, 'MmOnline', lobby, persist);
    this.scene = scene;
    this.flags = flags;
  }
}

// #################################################
// ##  Puppet Tracking
// #################################################

// export class SyncPuppet extends UDPPacket {
//   puppet: PData.IData;
//   constructor(lobby: string, value: PData.Data) {
//       super('SyncPuppet', 'BkOnline', lobby, false);
//       this.puppet = value;
//   }
// }

export class SyncLocation extends Packet {
  scene: number;
  constructor(lobby: string, scene: number) {
      super('SyncLocation', 'MmOnline', lobby, true);
      this.scene = scene;
  }
}
