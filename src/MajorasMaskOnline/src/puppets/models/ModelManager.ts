import {
  IModLoaderAPI,
  ModLoaderEvents,
  IPlugin,
} from 'modloader64_api/IModLoaderAPI';
import {
  EventHandler,
  EventsServer,
  EventServerLeft,
  EventsClient,
  EventServerJoined,
} from 'modloader64_api/EventHandler';
import { zzstatic } from './zzstatic/src/zzstatic';
import zlib, { deflateRaw } from 'zlib';
import { Age } from 'modloader64_api/OOT/OOTAPI';
import {
  ServerNetworkHandler,
  INetworkPlayer,
  NetworkHandler,
} from 'modloader64_api/NetworkHandler';
import { ModelPlayer } from './ModelPlayer';
import { ModelAllocationManager } from './ModelAllocationManager';
import fs from 'fs';
import { ModelThread } from './ModelThread';

export class FilePatch {
  offset: number;
  value: number;

  constructor(offset: number, value: number) {
    this.offset = offset;
    this.value = value;
  }
}

export class RomPatch {
  index: number;
  data: FilePatch[] = new Array<FilePatch>();
  hashOriginal!: string;
  hash!: string;

  constructor(index: number) {
    this.index = index;
  }
}

export class ModelManager {
  ModLoader: IModLoaderAPI;
  allocationManager: ModelAllocationManager;
  customModelFileAdult = '';
  customModelFileChild = '';
  customModelFileAnims = '';
  customModelRepointsAdult = __dirname + '/zobjs/adult_patch.zobj';
  customModelRepointsChild = __dirname + '/zobjs/child_patch.zobj';
  customModelFileAdultIcon = '';
  customModelFileChildIcon = '';

  constructor(
    ModLoader: IModLoaderAPI,
  ) {
    this.ModLoader = ModLoader;
    this.allocationManager = new ModelAllocationManager();
  }


  injectRawFileToRom(rom: Buffer, index: number, file: Buffer) {
    let dma = 0x7430;
    let offset: number = index * 0x10;
    let start: number = rom.readUInt32BE(dma + offset + 0x8);
    file.copy(rom, start);
  }

  getRawFileFromRom(rom: Buffer, index: number): Buffer {
    let dma = 0x7430;
    let offset: number = index * 0x10;
    let start: number = rom.readUInt32BE(dma + offset + 0x8);
    let end: number = rom.readUInt32BE(dma + offset + 0xc);
    let size: number = end - start;
    let isFileCompressed = true;
    if (end === 0) {
      isFileCompressed = false;
      size =
        rom.readUInt32BE(dma + offset + 0x4) - rom.readUInt32BE(dma + offset);
      end = start + size;
    }
    let buf: Buffer = Buffer.alloc(size);
    rom.copy(buf, 0, start, end);
    return buf;
  }

  decompressFileFromRom(rom: Buffer, index: number): Buffer {
    let dma = 0x7430;
    let offset: number = index * 0x10;
    let start: number = rom.readUInt32BE(dma + offset + 0x8);
    let end: number = rom.readUInt32BE(dma + offset + 0xc);
    let size: number = end - start;
    let isFileCompressed = true;
    if (end === 0) {
      isFileCompressed = false;
      size =
        rom.readUInt32BE(dma + offset + 0x4) - rom.readUInt32BE(dma + offset);
      end = start + size;
    }
    let buf: Buffer = Buffer.alloc(size);
    rom.copy(buf, 0, start, end);
    if (isFileCompressed) {
      buf = this.ModLoader.utils.yaz0Decode(buf);
    }
    return buf;
  }

  recompressFileIntoRom(rom: Buffer, index: number, file: Buffer) {
    let dma = 0x7430;
    let offset: number = index * 0x10;
    let start: number = rom.readUInt32BE(dma + offset + 0x8);
    let buf: Buffer = this.ModLoader.utils.yaz0Encode(file);
    buf.copy(rom, start);
  }

  @EventHandler(ModLoaderEvents.ON_ROM_PATCHED)
  onRomPatched(evt: any) {
    if (this.customModelFileChild === '' && this.customModelFileAdult === '') {
      return;
    }
    console.log('Starting custom model setup...');
    let adult = 502;
    let child = 503;
    let code = 27;
    let anim = 7;
    let offset = 0xe65a0;

    if (this.customModelFileAdult !== '') {
      console.log('Loading new Link model (Adult)...');
      let adult_model: Buffer = fs.readFileSync(this.customModelFileAdult);
      let _adult_model = this.ModLoader.utils.yaz0Encode(adult_model);
      let adult_zobj = this.getRawFileFromRom(evt.rom, adult);
      this.ModLoader.utils.clearBuffer(adult_zobj);
      _adult_model.copy(adult_zobj);
      this.injectRawFileToRom(evt.rom, adult, adult_zobj);

      let patch: RomPatch[] = new Array<RomPatch>();
      patch = JSON.parse(
        this.ModLoader.utils
          .yaz0Decode(fs.readFileSync(this.customModelRepointsAdult))
          .toString()
      );
      for (let i = 0; i < patch.length; i++) {
        let buf: Buffer = this.decompressFileFromRom(evt.rom, patch[i].index);
        for (let j = 0; j < patch[i].data.length; j++) {
          buf[patch[i].data[j].offset] = patch[i].data[j].value;
        }
        this.recompressFileIntoRom(evt.rom, patch[i].index, buf);
      }

      let code_file: Buffer = this.decompressFileFromRom(evt.rom, code);
      adult_model.writeUInt32BE(code_file.readUInt32BE(offset), 0x500c);
    }

    if (this.customModelFileChild !== '') {
      console.log('Loading new Link model (Child)...');
      let child_model: Buffer = fs.readFileSync(this.customModelFileChild);
      let _child_model = this.ModLoader.utils.yaz0Encode(child_model);
      let child_zobj = this.getRawFileFromRom(evt.rom, child);
      this.ModLoader.utils.clearBuffer(child_zobj);
      _child_model.copy(child_zobj);
      this.injectRawFileToRom(evt.rom, child, child_zobj);

      let patch: RomPatch[] = new Array<RomPatch>();
      patch = JSON.parse(
        this.ModLoader.utils
          .yaz0Decode(fs.readFileSync(this.customModelRepointsChild))
          .toString()
      );
      for (let i = 0; i < patch.length; i++) {
        let buf: Buffer = this.decompressFileFromRom(evt.rom, patch[i].index);
        for (let j = 0; j < patch[i].data.length; j++) {
          buf[patch[i].data[j].offset] = patch[i].data[j].value;
        }
        this.recompressFileIntoRom(evt.rom, patch[i].index, buf);
      }

      let code_file: Buffer = this.decompressFileFromRom(evt.rom, code);
      child_model.writeUInt32BE(code_file.readUInt32BE(offset + 0x4), 0x500c);

    
    }

    if (this.customModelFileAnims !== '') {
      console.log('Loading new animations...');
      let anim_file: Buffer = fs.readFileSync(this.customModelFileAnims);
      let anim_zobj: Buffer = this.getRawFileFromRom(evt.rom, anim);
      this.ModLoader.utils.clearBuffer(anim_zobj);
      anim_file.copy(anim_zobj);
      this.injectRawFileToRom(evt.rom, anim, anim_zobj);
    }  
  }
}
