import IMemory from 'modloader64_api/IMemory';
import * as API from '../API/Imports';

export class Player extends API.InstanceObj implements API.IPlayer {
    //subtract this.instance.Link from these values

  private current_form = 0x3ffefb;
  private link_actor = 0x3ffdb0;
  private link_animations_ptr = 0x779314;

  private pos_x_addr = 0x3ffeb8;
  private pos_y_addr = 0x3ffebc;
  private pos_z_addr = 0x3ffec0;

  private rot_x_addr = 0x3ffe6c;
  private rot_y_addr = 0x3ffe70;
  private rot_z_addr = 0x3ffe74;

  private current_mask = 0x3fff03; //Current equipped mask
  private current_anim = 0x3ffff8; //Current animation ID
  private current_anim_length = 0x40004;
  private current_anim_pos = 0x400008;
  private current_anim_speed = 0x40000c;
  private get_item = 0x400134;
  private last_coord_ground = 0x400170;
  private give_magic_bar = 0x3830dc;



  get position(): Buffer {
      let buf: Buffer = Buffer.alloc(12);
      buf.writeFloatBE(this.emulator.rdramReadF32(this.pos_x_addr), 0);
      buf.writeFloatBE(this.emulator.rdramReadF32(this.pos_y_addr), 4);
      buf.writeFloatBE(this.emulator.rdramReadF32(this.pos_z_addr), 8);
      return buf;
  }
  set position(val: Buffer) {
      this.emulator.rdramWriteBuffer(this.pos_x_addr, val.slice(0, 4));
      this.emulator.rdramWriteBuffer(this.pos_y_addr, val.slice(4, 8));
      this.emulator.rdramWriteBuffer(this.pos_z_addr, val.slice(8, 12));
  }

  get pos_x(): number {
      return this.emulator.rdramReadF32(this.pos_x_addr);
  }
  set pos_x(val: number) {
      this.emulator.rdramWriteF32(this.pos_x_addr, val);
  }

  get pos_y(): number {
      return this.emulator.rdramReadF32(this.pos_y_addr);
  }
  set pos_y(val: number) {
      this.emulator.rdramWriteF32(this.pos_y_addr, val);
  }

  get pos_z(): number {
      return this.emulator.rdramReadF32(this.pos_z_addr);
  }
  set pos_z(val: number) {
      this.emulator.rdramWriteF32(this.pos_z_addr, val);
  }


  get rotation(): Buffer {
      let buf: Buffer = Buffer.alloc(12);
      buf.writeFloatBE(this.emulator.rdramReadF32(this.rot_x_addr), 0);
      buf.writeFloatBE(this.emulator.rdramReadF32(this.rot_y_addr), 4);
      buf.writeFloatBE(this.emulator.rdramReadF32(this.rot_z_addr), 8);
      return buf;
  }
  set rotation(val: Buffer) {
      this.emulator.rdramWriteBuffer(this.rot_x_addr, val.slice(0, 4));
      this.emulator.rdramWriteBuffer(this.rot_y_addr, val.slice(4, 8));
      this.emulator.rdramWriteBuffer(this.rot_z_addr, val.slice(8, 12));
  }

  get rot_x(): number {
      return this.emulator.rdramReadF32(this.rot_x_addr);
  }
  set rot_x(val: number) {
      this.emulator.rdramWriteF32(this.rot_x_addr, val);
  }

  get rot_y(): number {
      return this.emulator.rdramReadF32(this.rot_y_addr);
  }
  set rot_y(val: number) {
      this.emulator.rdramWriteF32(this.rot_y_addr, val);
  }

  get rot_z(): number {
      return this.emulator.rdramReadF32(this.rot_z_addr);
  }
  set rot_z(val: number) {
      this.emulator.rdramWriteF32(this.rot_z_addr, val);
  }

  get anim(): Buffer {
    return this.emulator.rdramReadBuffer(this.link_animations_ptr, 0x0C);
}

  set anim(val: Buffer) {
    this.emulator.rdramWriteBuffer(this.link_animations_ptr, val);
}

  constructor(emu: IMemory) {
      super(emu, 0x3ffdb0);
  }
}
