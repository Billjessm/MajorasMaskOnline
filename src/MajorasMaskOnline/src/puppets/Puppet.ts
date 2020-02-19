import { ICommandBuffer, Command } from 'MajorasMask/API/ICommandBuffer';
import { INetworkPlayer } from 'modloader64_api/NetworkHandler';
import IMemory from 'modloader64_api/IMemory';
import uuid from 'uuid';
import * as API from 'MajorasMask/API/Imports';
import * as PData from './Instance';

export class Puppet extends API.BaseObj {
	core: API.IMMCore;
	nplayer: INetworkPlayer;
	data: PData.Data;
	id: string;
	scene: number;
	form: API.FormType;
	canHandle = false;
	isSpawned = false;
	isShoveled = false;
	isWaiting = false;
	void!: Buffer;

	log(msg: string) {
		console.info('info:    [Puppet] ' + msg);
	}

	constructor(
		emu: IMemory,
		core: API.IMMCore,
		nplayer: INetworkPlayer,
		pointer: number
	) {
		super(emu);
		this.data = new PData.Data(emu, pointer, core);
		this.core = core;
		this.nplayer = nplayer;
		this.id = uuid.v4();
		this.scene = -1;
		this.form = API.FormType.HUMAN;
	}

	handleInstance(data: PData.Data) {
		if (this.isWaiting || !this.isSpawned ||
			!this.canHandle || this.isShoveled) return;
		Object.keys(data).forEach((key: string) => {
			(this.data as any)[key] = (data as any)[key];
		});
	}

	disable_despawn() {
		let ptr = this.data.pointer;
		this.emulator.rdramWrite8(ptr + 0x3, 0xff);
		this.void = this.emulator.rdramReadBuffer(ptr + 0x24, 0xc);
	}

	spawn() {
		this.isSpawned = (this.data.pointer !== 0x000000);
		this.canHandle = false;

		if (this.isWaiting) return;

		this.isShoveled = false;

		if (this.isSpawned) {
			this.canHandle = true;
			return;
		}

		this.isWaiting = true;
		this.emulator.rdramWrite16(0x80000e, this.form);
		this.core.commandBuffer.runCommand(
			Command.SPAWN_ACTOR,
			0x80800000,
			(success: boolean, result: number) => {
				this.isWaiting = false;

				if (!success) {
					this.log('Spawn Failed');
					return;
				}

				let ptr = result & 0x00ffffff
				this.data.pointer = ptr;
				this.disable_despawn();
				this.isSpawned = true;
				this.canHandle = true;

				this.log('Puppet spawned! ' + ptr.toString(16).toUpperCase());
			}
		);

	}

	despawn() {
		this.isSpawned = (this.data.pointer !== 0x000000);
		this.canHandle = false;
		this.isShoveled = false;

		if (this.isWaiting || !this.isSpawned) return;

		this.emulator.rdramWriteBuffer(this.data.pointer + 0x24, this.void);
		this.emulator.rdramWrite32(this.data.pointer + 0x130, 0x0);
		this.emulator.rdramWrite32(this.data.pointer + 0x134, 0x0);
		this.data.pointer = 0x000000;
		this.isSpawned = false;

		this.log('Puppet ' + this.id + ' despawned.');
	}

	shovel() {
		this.isSpawned = (this.data.pointer !== 0x000000);
		this.canHandle = false;

		if (this.isWaiting || !this.isSpawned || this.isShoveled) return;

		this.emulator.rdramWriteBuffer(this.data.pointer + 0x24, this.void);
		this.isShoveled = true;

		this.log('Puppet ' + this.id + ' shoveled.');
	}
}
