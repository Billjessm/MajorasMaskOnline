import { Puppet } from './Puppet';
import { IMMCore, ISaveContext } from 'MajorasMask/API/Imports';
import IMemory from 'modloader64_api/IMemory';
import { INetworkPlayer, LobbyData } from 'modloader64_api/NetworkHandler';
import { IModLoaderAPI, ILogger } from 'modloader64_api/IModLoaderAPI';
import * as Net from '../network/Imports';
import fs from 'fs';

export class PuppetOverlord {
  private logger: ILogger;
  private core!: IMMCore;
  private emulator!: IMemory;
  private puppets: Map<string, Puppet> = new Map<string, Puppet>();
  private awaiting_spawn: Puppet[] = new Array<Puppet>();
  fakeClientPuppet!: Puppet;
  private amIAlone = true;
  private playersAwaitingPuppets: INetworkPlayer[] = new Array<
    INetworkPlayer
  >();
  private mapi!: IModLoaderAPI;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  postinit(
    core: IMMCore,
    emulator: IMemory,
    player: INetworkPlayer,
    mapi: IModLoaderAPI
  ) {
    this.emulator = emulator;
    this.core = core;
    this.mapi = mapi;

    this.fakeClientPuppet = new Puppet(
      player,
      core.player,
      core.save,
      emulator,
      // The pointer here points to blank space, so should be fine.
      0x6011e8,
      core.commandBuffer,
      this.mapi
    );
  }

  get current_scene() {
    return this.fakeClientPuppet.scene;
  }

  localPlayerLoadingZone() {
    this.puppets.forEach(
      (value: Puppet, key: string, map: Map<string, Puppet>) => {
        value.despawn();
      }
    );
    this.awaiting_spawn.splice(0, this.awaiting_spawn.length);
  }

  localPlayerChangingScenes(entering_scene: number, Form: number) {
    this.awaiting_spawn.splice(0, this.awaiting_spawn.length);
    this.fakeClientPuppet.scene = entering_scene;
    this.fakeClientPuppet.Form = Form;
  }

  registerPuppet(player: INetworkPlayer) {
    this.logger.info(
      'Player ' + player.nickname + ' awaiting puppet assignment.'
    );
    this.playersAwaitingPuppets.push(player);
  }

  unregisterPuppet(player: INetworkPlayer) {
    if (this.puppets.has(player.uuid)) {
      let puppet: Puppet = this.puppets.get(player.uuid)!;
      puppet.despawn();
      this.puppets.delete(player.uuid);
    }
    if (this.playersAwaitingPuppets.length > 0) {
      let index = -1;
      for (let i = 0; i < this.playersAwaitingPuppets.length; i++) {
        if (this.playersAwaitingPuppets[i].uuid === player.uuid) {
          index = i;
          break;
        }
      }
      if (index > -1) {
        this.playersAwaitingPuppets.splice(index, 1);
      }
    }
  }

  changePuppetScene(player: INetworkPlayer, entering_scene: number, Form: number) {
    if (this.puppets.has(player.uuid)) {
      let puppet = this.puppets.get(player.uuid)!;
      if (puppet.isSpawned && puppet.Form !== Form) {
        puppet.despawn();
      }
      puppet.scene = entering_scene;
      puppet.Form = Form;
      this.logger.info(
        'Puppet ' + puppet.id + ' moved to scene ' + puppet.scene
      );
      if (this.fakeClientPuppet.scene === puppet.scene) {
        this.logger.info(
          'Queueing puppet ' + puppet.id + ' for immediate spawning.'
        );
        this.awaiting_spawn.push(puppet);
      }
    } else {
      this.logger.info('No puppet found for player ' + player.nickname + '.');
    }
  }

  processNewPlayers() {
    if (this.playersAwaitingPuppets.length > 0) {
      let player: INetworkPlayer = this.playersAwaitingPuppets.splice(0, 1)[0];
      this.puppets.set(
        player.uuid,
        new Puppet(
          player,
          this.core.player,
          this.core.save,
          this.emulator,
          0x0,
          this.core.commandBuffer,
          this.mapi
        )
      );
      this.logger.info(
        'Player ' +
        player.nickname +
        ' assigned new puppet ' +
        this.puppets.get(player.uuid)!.id +
        '.'
      );
      this.mapi.clientSide.sendPacket(
        new Net.MmO_PuppetPacket(this.fakeClientPuppet.data, this.mapi.clientLobby)
      );
    }
  }

  processAwaitingSpawns() {
    if (this.awaiting_spawn.length > 0) {
      let puppet: Puppet = this.awaiting_spawn.shift() as Puppet;
      puppet.spawn();
    }
  }

  lookForStrandedPuppets() {
    this.puppets.forEach(
      (value: Puppet, key: string, map: Map<string, Puppet>) => {
        if (
          value.scene !== this.fakeClientPuppet.scene &&
          value.isSpawned &&
          !value.isShoveled
        ) {
          value.shovel();
        }
      }
    );
  }

  lookForMissingPuppets() {
    let check = false;
    this.puppets.forEach(
      (value: Puppet, key: string, map: Map<string, Puppet>) => {
        if (value.scene === this.fakeClientPuppet.scene) {
          if (!value.isSpawned && this.awaiting_spawn.indexOf(value) === -1) {
            this.awaiting_spawn.push(value);
          }
          check = true;
        }
      }
    );
    if (check) {
      this.amIAlone = false;
    } else {
      this.amIAlone = true;
    }
  }

  sendPuppetPacket() {
    if (!this.amIAlone) {
      this.mapi.clientSide.sendPacket(
        new Net.MmO_PuppetPacket(this.fakeClientPuppet.data, this.mapi.clientLobby)
      );
    }
  }

  processPuppetPacket(packet: Net.MmO_PuppetPacket) {
    if (this.puppets.has(packet.player.uuid)) {
      let puppet: Puppet = this.puppets.get(packet.player.uuid)!;
      puppet.processIncomingPuppetData(packet.data);
    }
  }

  generateCrashDump() {
    let _puppets: any = {};
    this.puppets.forEach(
      (value: Puppet, key: string, map: Map<string, Puppet>) => {
        _puppets[key] = {
          isSpawned: value.isSpawned,
          isSpawning: value.isSpawning,
          isShoveled: value.isShoveled,
          pointer: value.data.pointer,
          player: value.player,
        };
      }
    );
    fs.writeFileSync(
      './PuppetOverlord_crashdump.json',
      JSON.stringify(_puppets, null, 2)
    );
  }

  onTick() {
    if (
      !this.core.runtime.entering_zone()
    ) {
      this.processNewPlayers();
      this.processAwaitingSpawns();
      this.lookForStrandedPuppets();
      this.lookForMissingPuppets();
    }
    this.sendPuppetPacket();
  }
}
