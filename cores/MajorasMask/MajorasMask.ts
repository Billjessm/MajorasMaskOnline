import { EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import {
    IModLoaderAPI,
    ICore,
    ModLoaderEvents,
} from 'modloader64_api/IModLoaderAPI';
import { CommandBuffer } from './src/CommandBuffer';
import * as API from './API/Imports';
import * as CORE from './src/Imports';

export class MajorasMask implements ICore, API.IMMCore {
  header = "ZELDA MAJORA'S MASK";
  ModLoader: IModLoaderAPI = {} as IModLoaderAPI;
  eventTicks: Map<string, Function> = new Map<string, Function>();

  player!: API.IPlayer;
  runtime!: API.IRuntime;
  save!: API.ISaveContext;
  commandBuffer!: CommandBuffer;
  payloads: string[] = new Array<string>();

  isPlaying(): boolean {
      return !(this.save.get_checksum() === 0 || this.isTitleScreen());
  }

  isTitleScreen(): boolean {
      let value = this.runtime.get_current_scene();
      return value === 0x8022 || value === 0x8024;
  }

  preinit(): void {}

  init(): void {
      this.payloads.push(__dirname + '/src/MajorasMask.payload');
  }

  postinit(): void {
      this.player = new CORE.Player(this.ModLoader.emulator);
      this.runtime = new CORE.Runtime(this.ModLoader.emulator);
      this.save = new CORE.SaveContext(this.ModLoader.emulator);
      this.commandBuffer = new CommandBuffer(this.ModLoader.emulator);
      this.eventTicks.set('tickingStuff', () => {
          this.commandBuffer.onTick();
      });
  }

  onTick(): void {
      this.eventTicks.forEach((value: Function, key: string) => {
          value();
      });
  }

  @EventHandler(ModLoaderEvents.ON_ROM_HEADER_PARSED)
  onModLoader_RomHeaderParsed(header: Buffer) {}

  @EventHandler(EventsClient.ON_INJECT_FINISHED)
  onCore_InjectFinished(evt: any) {
      for (let i = 0; i < this.payloads.length; i++) {
          this.ModLoader.payloadManager.parseFile(this.payloads[i]);
      }
  }
}

export default MajorasMask;
