import {
    bus,
    EventHandler,
    EventsClient,
    EventServerJoined,
    EventServerLeft,
    EventsServer,
    setupEventHandlers,
  } from 'modloader64_api/EventHandler';
import { IModLoaderAPI, IPlugin } from 'modloader64_api/IModLoaderAPI';
import {
    ILobbyStorage,
    INetworkPlayer,
    IPacketHeader,
    LobbyData,
    NetworkHandler,
    ServerNetworkHandler,
} from 'modloader64_api/NetworkHandler';

import { InjectCore } from 'modloader64_api/CoreInjection';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import * as API from 'MajorasMask/API/Imports';
import * as Net from './network/Imports';
import { SyncConfig, MmO_PuppetPacket , SyncTimeReset, SyncSceneData, SceneData, SyncPlayerData} from './network/Imports';
import { PuppetOverlord } from './puppets/PuppetOverlord';
import { Puppet } from './puppets/Puppet';
import { PuppetData } from './puppets/PuppetData';
import { Player } from '../../../cores/MajorasMask/src/Player';
import { PayloadType } from 'modloader64_api/PayloadType';
import fs from 'fs';
import path from 'path';
import { zzstatic, zzstatic_cache } from './puppets/models/zzstatic/src/zzstatic';
import { MMEvents, MmOnlineEvents } from '../../../cores/MajorasMask/API/Enums';
import { SaveContext } from '../../../cores/MajorasMask/src/Imports';


export class MmOnline implements IPlugin {
    ModLoader = {} as IModLoaderAPI;
    name = 'MmOnline';

    @InjectCore() core!: API.IMMCore;

    // Storage Variables
    db = new Net.DatabaseClient();

    protected curScene: number = -1;

    // Client variables
    overlord!: PuppetOverlord;

    reset_session(flagsOnly: boolean) {
        if (!flagsOnly) {
            this.db.clock_init = false;
        }

        this.db.clock_need_update = true;
        this.db.cycle_need_update = true;
        this.db.event_need_update = true;

        this.db.bank_need_update = true;
        this.db.health_need_update = true;
        this.db.trade_need_update = true;
        this.db.bottles_need_update = true;
    }

    check_db_instance(db: Net.Database, scene: number) {
        // Spawn missing scene variable!
        if (db.hasOwnProperty(scene)) return;
        db.scene_data[scene] = new Net.SceneData();
    }

    handle_reset_time(scene: number) {
        if (scene === this.curScene) return;

        // Make sure we are on cutscene map
        if (scene !== 0x08) return;

        // Make sure we are invoking ocarina reset time
        if (this.core.runtime.cutscene_ptr !== 0x8072d7d0) return;

        // Only progress if we havent invoked a time reset
        if (this.db.time_reset) return;

        this.db.time_reset = true;

        // Time sync feature only -- Only fix inventory
        if (this.db.timeless) {
            this.db.items = this.core.save.item_slots.array;
            return;
        }

        let pData = new SyncTimeReset(
            this.ModLoader.clientLobby,
            this.db.cycle_bak,
            this.db.event_bak,
            this.db.clock_bak,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_scene_change(scene: number) {
        if (scene === this.curScene) return;

        // Clock can begin functioning
        if (this.curScene === 0x804d) {
            this.db.clock_init = true;
            this.db.time_reset = false;
        }
        // Set global to current scene value
        this.curScene = scene;

        
        // Ensure we have this scene data!
        this.check_db_instance(this.db, scene);

        
        // Alert scene change!
        this.ModLoader.clientSide.sendPacket(new Net.SyncLocation(this.ModLoader.clientLobby, scene));
        this.ModLoader.logger.info('[Tick] Moved to scene[' + scene + '].');
    }

    handle_cycle_flags(bufData: Buffer, bufStorage: Buffer) {
        if (this.db.cycle_need_update) {
            // Time sync feature only
            if (!this.db.timeless)
                this.core.save.cycle_flags.set_all(this.db.cycle_flags);

            this.db.cycle_need_update = false;
            return;
        }

        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let count = 0;
        let needUpdate = false;

        bufData = this.core.save.cycle_flags.get_all();
        bufStorage = this.db.cycle_flags;
        count = bufData.byteLength;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            this.core.save.cycle_flags.set(i, bufData[i]);
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.cycle_flags = bufData;
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncCycleFlags', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_event_flags(bufData: Buffer, bufStorage: Buffer) {
        if (this.db.event_need_update) {
            // Time sync feature only
            if (!this.db.timeless)
                this.core.save.event_flags.set_all(this.db.event_flags);

            this.db.event_need_update = false;
            return;
        }

        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let count = 0;
        let needUpdate = false;

        bufData = this.core.save.event_flags.get_all();
        bufStorage = this.db.event_flags;
        count = bufData.byteLength;

        // Detect Changes
        {
            for (i = 0; i < count; i++) {
                if (bufData[i] === bufStorage[i]) continue;

                // Quick check to handle normal
                if (i < 11 || (i > 11 && i < 73) || i > 83) {
                    bufData[i] |= bufStorage[i];
                    this.core.save.event_flags.set(i, bufData[i]);
                    needUpdate = true;
                    continue;
                }

                // Below only does large checks for a few values
                // instead of every single loop.

                // Handle for bomber kid bullshit
                if (
                    i === 11 || i === 76 || // Bomber Kids Caught
                    i === 73 || i === 75 || // Bomber Kids Cutscenes
                    i === 77 || i === 83 // Bomber Kids Cutscenes
                ) continue;

                bufData[i] |= bufStorage[i];
                this.core.save.event_flags.set(i, bufData[i]);
                needUpdate = true;
            }

            // Bomber kid exclusion
            {
                if (bufData[73] !== bufStorage[73]) {
                    bufData[73] |= bufStorage[73];
                    this.core.save.event_flags.set(73, bufData[73]);

                    bufData[73] &= 0xcf;
                    bufStorage[73] &= 0xcf;
                    if (bufData[73] !== bufStorage[73])
                        needUpdate = true;
                }

                if (bufData[75] !== bufStorage[75]) {
                    bufData[75] |= bufStorage[75];
                    this.core.save.event_flags.set(75, bufData[75]);

                    bufData[75] &= 0x9f;
                    bufStorage[75] &= 0x9f;
                    if (bufData[75] !== bufStorage[75])
                        needUpdate = true;
                }

                if (bufData[77] !== bufStorage[77]) {
                    bufData[77] |= bufStorage[77];
                    this.core.save.event_flags.set(77, bufData[77]);

                    bufData[77] &= 0xfd;
                    bufStorage[77] &= 0xfd;
                    if (bufData[77] !== bufStorage[77])
                        needUpdate = true;
                }

                if (bufData[83] !== bufStorage[83]) {
                    bufData[83] |= bufStorage[83];
                    this.core.save.event_flags.set(83, bufData[83]);

                    bufData[83] &= 0xfb;
                    bufStorage[83] &= 0xfb;
                    if (bufData[83] !== bufStorage[83])
                        needUpdate = true;
                }
            }
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.event_flags = bufData;
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncEventFlags', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_game_flags(bufData: Buffer, bufStorage: Buffer) {
        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let count = 0;
        let needUpdate = false;

        bufData = this.core.save.game_flags.get_all();
        bufStorage = this.db.game_flags;
        count = bufData.byteLength;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            this.core.save.game_flags.set(i, bufData[i]);
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.game_flags = bufData;
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncGameFlags', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_owl_flags(bufData: Buffer, bufStorage: Buffer) {
        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let count = 0;
        let needUpdate = false;

        bufData = this.core.save.owl_flags.get_all();
        bufStorage = this.db.owl_flags;
        count = bufData.byteLength;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            this.core.save.owl_flags.set(i, bufData[i]);
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.owl_flags = bufData;
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncOwlFlags', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_intro_flag(scene: number) {
        // Initializers
        let pData: Net.SyncNumbered;
        let stateData: number;
        let stateStorage: number
        let needUpdate = false;

        stateData = this.core.save.intro_flag;
        stateStorage = this.db.intro_state;

        if (stateData < stateStorage) {
            // Make sure we are on cutscene map
            if (scene !== 0x08) return;
            if (this.db.intro_buffer < 20) {
                this.db.intro_buffer += 1;
                return;
            }

            this.core.save.intro_flag = stateStorage;
            this.core.save.current_form = API.FormType.DEKU;
            this.core.save.have_tatl = true;
            this.core.runtime.goto_scene(0x0000D800);
            return;
        } else if (stateData > stateStorage) {
            this.db.intro_state = stateData;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        pData = new Net.SyncNumbered(this.ModLoader.clientLobby, 'SyncIntroState', stateData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_scene_data(bufData: Buffer, bufStorage: Buffer) {
        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let pData: Net.SyncSceneData;
        let i: number;
        let count = 0;
        let scene = this.curScene;
        let needUpdate = false;

        bufData = this.core.runtime.scene_flags.get_all();
        bufStorage = (this.db.scene_data[scene] as Net.SceneData).flags;
        count = bufData.byteLength;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            this.core.runtime.scene_flags.set(i, bufData[i]);
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.scene_data[scene].flags = bufData;
        pData = new Net.SyncSceneData(this.ModLoader.clientLobby, scene, bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_bank() {
        if (this.db.bank_need_update) {
            this.core.save.bank = this.db.bank;
            this.db.bank_need_update = false;
            return;
        }

        // Initializers
        let count = this.core.save.bank;
        let needUpdate = false;

        if (count !== this.db.bank) needUpdate = true;

        // Process Changes
        if (!needUpdate) return;

        this.db.bank = count;

        // Send changes to server
        let pData = new Net.SyncNumbered(this.ModLoader.clientLobby, 'SyncBank', count, true);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_quest_status() {
        // Initializers
        let status = this.core.save.quest_status;
        let needUpdate = false;

        if (status !== this.db.quest_status) {
            status |= this.db.quest_status;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.core.save.quest_status = status;
        this.db.quest_status = status;

        // Send changes to server
        let pData = new Net.SyncNumbered(this.ModLoader.clientLobby, 'SyncQuestStatus', status, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_health() {
        if (this.db.health_need_update) {
            this.core.save.health.pieces = this.db.health.pieces;
            this.db.health_need_update = false;
        }

        // Initializers
        let hpData = this.core.save.health;
        let hpStorage = this.db.health;
        let needUpdate = false;

        if (hpData.heart_container < hpStorage.containers) {
            this.core.save.health.heart_container = hpStorage.containers;
        } else if (hpData.heart_container > hpStorage.containers) {
            hpStorage.containers = hpData.heart_container;
            needUpdate = true;
        }

        if (hpData.double_defense < hpStorage.double_defense) {
            this.core.save.health.double_defense = hpStorage.double_defense;
        } else if (hpData.double_defense > hpStorage.double_defense) {
            hpStorage.double_defense = hpData.double_defense;
            needUpdate = true;
        }

        if (hpData.pieces !== hpStorage.pieces) {
            hpStorage.pieces = hpData.pieces;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.health = hpStorage;

        // Send changes to server
        let pData = new Net.SyncHealth(
            this.ModLoader.clientLobby,
            hpStorage.containers,
            hpStorage.double_defense,
            hpStorage.pieces,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_magic() {
        // Initializers
        let barData = this.core.save.magic.bar;
        let barStorage = this.db.magic.bar;
        let needUpdate = false;

        if (barData < barStorage) {
            this.core.save.magic.bar = barStorage;
        } else if (barData > barStorage) {
            this.db.magic.bar = barData;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        // Send changes to server
        let pData = new Net.SyncMagic(
            this.ModLoader.clientLobby,
            this.db.magic.bar,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_equip_slots() {
        // Initializers
        let val1: number;
        let val2: number;
        let needUpdate = false;

        let equips: Net.EquipData = new Net.EquipData();
        equips.sword = this.core.save.equip_slots.sword;
        equips.shield = this.core.save.equip_slots.shield;
        equips.quiver = this.core.save.equip_slots.quiver;
        equips.bomb_bag = this.core.save.equip_slots.bomb_bag;

        if (equips.sword < this.db.equips.sword) {
            this.core.save.equip_slots.sword = this.db.equips.sword;
            equips.sword = this.db.equips.sword;
        } else if (equips.sword > this.db.equips.sword) {
            needUpdate = true;
        }

        if (equips.shield < this.db.equips.shield) {
            this.core.save.equip_slots.shield = this.db.equips.shield;
            equips.shield = this.db.equips.shield;
        } else if (equips.shield > this.db.equips.shield) {
            needUpdate = true;
        }

        val1 = equips.bomb_bag !== 255 ? equips.bomb_bag : -1;
        val2 = this.db.equips.bomb_bag !== 255 ? this.db.equips.bomb_bag : -1;

        if (val1 > val2) {
            needUpdate = true;
        } else if (val1 < val2) {
            this.core.save.equip_slots.bomb_bag = this.db.equips.bomb_bag;
            equips.bomb_bag = this.db.equips.bomb_bag;
            needUpdate = true;
        }

        val1 = equips.quiver !== 255 ? equips.quiver : -1;
        val2 = this.db.equips.quiver !== 255 ? this.db.equips.quiver : -1;

        if (val1 > val2) {
            needUpdate = true;
        } else if (val1 < val2) {
            this.core.save.equip_slots.quiver = this.db.equips.quiver;
            equips.quiver = this.db.equips.quiver;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.equips = equips;

        // Send changes to server
        let pData = new Net.SyncEquipSlots(this.ModLoader.clientLobby, equips, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_item_slots(bufData: Buffer, bufStorage: Buffer) {

        // Time sync version
        if (!this.db.timeless) {
            if (this.db.bottles_need_update) {
                bufData = this.core.save.item_slots.array;
                bufData[0x12] = this.db.items[0x12];
                bufData[0x13] = this.db.items[0x13];
                bufData[0x14] = this.db.items[0x14];
                bufData[0x15] = this.db.items[0x15];
                bufData[0x16] = this.db.items[0x16];
                bufData[0x17] = this.db.items[0x17];
                this.core.save.item_slots.array = bufData;
                this.db.bottles_need_update = false;
            }
            if (this.db.trade_need_update) {
                bufData = this.core.save.item_slots.array;
                bufData[0x05] = this.db.items[0x05];
                bufData[0x0b] = this.db.items[0x0b];
                bufData[0x11] = this.db.items[0x11];
                this.core.save.item_slots.array = bufData;
                this.db.trade_need_update = false;
            }
        }
        // Timeless version
        else {
            if (this.db.bottles_need_update) {
                bufData = this.core.save.item_slots.array;

                // If a new bottle was collected that we dont have give empty bottles
                if (bufData[0x12] === 255 && this.db.items[0x12] !== 255)
                    bufData[0x12] = API.ItemType.BOTTLE_EMPTY;
                if (bufData[0x13] === 255 && this.db.items[0x13] !== 255)
                    bufData[0x13] = API.ItemType.BOTTLE_EMPTY;
                if (bufData[0x14] === 255 && this.db.items[0x14] !== 255)
                    bufData[0x14] = API.ItemType.BOTTLE_EMPTY;
                if (bufData[0x15] === 255 && this.db.items[0x15] !== 255)
                    bufData[0x15] = API.ItemType.BOTTLE_EMPTY;
                if (bufData[0x16] === 255 && this.db.items[0x16] !== 255)
                    bufData[0x16] = API.ItemType.BOTTLE_EMPTY;
                if (bufData[0x17] === 255 && this.db.items[0x17] !== 255)
                    bufData[0x17] = API.ItemType.BOTTLE_EMPTY;

                this.core.save.item_slots.array = bufData;
                this.db.bottles_need_update = false;
            }
        }

        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let n: number;
        let x: number;
        let y: number;
        let val1: number;
        let val2: number;
        let needUpdate = false;

        bufData = this.core.save.item_slots.array;
        bufStorage = this.db.items;
        needUpdate = false;

        // Normal items with upgrades
        for (i = 0; i < 3; i++) {
            x = i * 6;
            for (n = 0; n < 5; n++) {
                y = x + n;
                val1 = bufData[y] !== 255 ? bufData[y] : -1;
                val2 = bufStorage[y] !== 255 ? bufStorage[y] : -1;

                if (val1 > val2) {
                    bufStorage[y] = bufData[y];
                    needUpdate = true;
                } else if (val1 < val2) {
                    needUpdate = true;
                }
            }
        }

        // Time sync version
        if (!this.db.timeless) {
            // Trade Items
            if (bufData[0x05] !== bufStorage[0x05]) {
                bufStorage[0x05] = bufData[0x05];
                needUpdate = true;
            }
            if (bufData[0x0b] !== bufStorage[0x0b]) {
                bufStorage[0x0b] = bufData[0x0b];
                needUpdate = true;
            }
            if (bufData[0x11] !== bufStorage[0x11]) {
                bufStorage[0x11] = bufData[0x11];
                needUpdate = true;
            }

            // Bottles
            for (i = 0x12; i < 0x18; i++) {
                val1 = bufData[i] !== 255 ? bufData[i] : -1;
                val2 = bufStorage[i] !== 255 ? bufStorage[i] : -1;

                if (val1 !== val2 && val1 > -1) {
                    bufStorage[i] = bufData[i];
                    needUpdate = true;
                }
            }
        }
        // Timeless version
        else {
            // Trade Items -- just make sure our database
            // has these values so they dont get nuked on
            // item updates.
            bufStorage[0x05] = bufData[0x05];
            bufStorage[0x0b] = bufData[0x0b];
            bufStorage[0x11] = bufData[0x11];

            // Bottles
            for (i = 0x12; i < 0x18; i++) {
                val1 = bufData[i] !== 255 ? bufData[i] : -1;
                val2 = bufStorage[i] !== 255 ? bufStorage[i] : -1;

                if (val1 !== val2 && val1 > -1) {
                    bufStorage[i] = bufData[i];
                    needUpdate = true;
                }
            }
        }

        // Process Changes
        if (!needUpdate) return;

        this.core.save.item_slots.array = bufStorage;
        this.db.items = bufStorage;

        // Send changes to server
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncItemSlots', bufStorage, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_masks_slots(bufData: Buffer, bufStorage: Buffer) {
        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let val1: number;
        let val2: number;
        let count: number;
        let needUpdate = false;

        bufData = this.core.save.mask_slots.array;
        bufStorage = this.db.masks;
        count = bufData.byteLength;
        needUpdate = false;

        for (i = 0; i < count; i++) {
            val1 = bufData[i] !== 255 ? bufData[i] : -1;
            val2 = bufStorage[i] !== 255 ? bufStorage[i] : -1;

            if (val1 > val2) {
                needUpdate = true;
            } else if (val1 < val2) {
                bufData[i] = bufStorage[i];
                needUpdate = true;
            }
        }

        if (!needUpdate) return;

        // Assign true data back to game and network
        this.core.save.mask_slots.array = bufData;
        this.db.masks = bufData;

        // Send changes to server
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncMaskSlots', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_clock() {
        if (this.db.clock_need_update) {
            // Time sync feature only
            if (!this.db.timeless) {
                this.core.save.clock.current_day = this.db.clock.current_day;
                this.core.save.clock.elapsed = this.db.clock.elapsed;
                this.core.save.clock.is_night = this.db.clock.is_night;
                this.core.save.clock.speed = this.db.clock.speed;
                this.core.save.clock.time = this.db.clock.time;
                this.db.clock_live = this.db.clock;
            }
            this.db.clock_need_update = false;
            return;
        }

        // Time sync feature only
        if (this.db.timeless) return;

        if (!this.db.clock_init) return;

        // Initializers
        let pData: Net.SyncClock;
        let cur_day: number = this.core.save.clock.current_day;
        let elapsed: number = this.core.save.clock.elapsed;
        let speed: number = this.core.save.clock.speed;
        let time: number = this.core.save.clock.time;
        let timeData = Math.floor(this.core.save.clock.time / 0x1000);
        let timeStorage = Math.floor(this.db.clock.time / 0x1000);
        let is_night: boolean = this.core.save.clock.is_night;
        let needUpdate: boolean = false;

        let clock = new Net.ClockData();
        clock.current_day = cur_day;
        clock.elapsed = elapsed;
        clock.is_night = is_night;
        clock.speed = speed;
        clock.time = time;
        clock.is_started = true;

        // Check time to backup data when save is invoked
        {
            if (
                cur_day < this.db.clock_live.current_day ||
                elapsed < this.db.clock_live.elapsed ||
                time < this.db.clock_live.time ||
                is_night !== this.db.clock_live.is_night
            ) {
                this.db.clock_bak = clock;
                this.db.cycle_bak = this.core.save.cycle_flags.get_all();
                this.db.event_bak = this.core.save.event_flags.get_all();
            }

        }

        // Compare major changes
        if (cur_day !== this.db.clock.current_day) needUpdate = true;
        if (elapsed !== this.db.clock.elapsed) needUpdate = true;
        if (is_night !== this.db.clock.is_night) needUpdate = true;
        if (speed !== this.db.clock.speed) needUpdate = true;
        if (timeData !== timeStorage) needUpdate = true;

        // Process Changes
        if (!needUpdate) {
            this.db.clock_live = clock;
            return;
        }

        this.db.clock = clock;
        this.db.clock_live = clock;

        pData = new Net.SyncClock(this.ModLoader.clientLobby, clock);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_map() {
        // Initializers
        let visible = this.core.save.map_visible;
        let visited = this.core.save.map_visited;
        let map = this.db.map;
        let needUpdate = false;

        if (visible !== map.visible) {
            visible &= map.visible;
            this.core.save.map_visible = visible;
            this.db.map.visible = visible;
            needUpdate = true;
        }

        if (visited !== map.visited) {
            visited &= map.visited;
            this.core.save.map_visited = visited;
            this.db.map.visited = visited;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        // Send changes to server
        let pData = new Net.SyncMap(this.ModLoader.clientLobby, visible, visited, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }
    
    constructor() { }

    preinit(): void {
        //this.pMgr = new Puppet.PuppetManager();
        this.overlord = new PuppetOverlord(this.ModLoader.logger);

    }

    init(): void { }

    postinit(): void {

        this.ModLoader.payloadManager.registerPayloadType(
            new OverlayPayload('.ovl')
        );

        let zz = new zzstatic();

        let zobjbuf = zz.doRepoint(fs.readFileSync(__dirname + '/ChildLink.zobj'), 0);
        
        this.ModLoader.utils.setTimeoutFrames(()=>{this.ModLoader.emulator.rdramWriteBuffer(0x8000000, zobjbuf)}, 100);
        
    }

    onTick(): void {
        // Make sure we dont process game when not playing
        if (!this.core.isPlaying()) {
            if (this.core.isTitleScreen() &&
                this.db.game_active) this.reset_session(false);
            return;
        }

        this.overlord.onTick();

        // Initializers
        let bufStorage: Buffer;
        let bufData: Buffer;
        let scene: number = this.core.runtime.get_current_scene();
        
        // Intro skip
        this.handle_intro_flag(scene);

        // Day transition handler
        if (this.db.clock.is_started &&
            !this.db.clock_init) this.reset_session(true);

        // General Setup/Handlers
        this.handle_reset_time(scene);
        this.handle_scene_change(scene);
        // this.handle_puppets(scene);

        // Need to finish resetting the cycle
        if (this.db.time_reset) return;

        // Sync Specials
        if (this.curScene !== 0x08)
            this.handle_clock();

        // Sync Flags
        this.handle_cycle_flags(bufData!, bufStorage!);
        //this.handle_event_flags(bufData!, bufStorage!);
        this.handle_game_flags(bufData!, bufStorage!);
        this.handle_owl_flags(bufData!, bufStorage!);
        this.handle_scene_data(bufData!, bufStorage!);

        // Sync Misc
        this.handle_bank();
        this.handle_quest_status();
        this.handle_health();
        this.handle_magic();
        //this.handle_map();

        // Sync Start Menu Items
        this.handle_equip_slots();
        this.handle_item_slots(bufData!, bufStorage!);
        this.handle_masks_slots(bufData!, bufStorage!);
    }

    @EventHandler(EventsClient.ON_INJECT_FINISHED)
    onClient_InjectFinished(evt: any) { }

    @EventHandler(EventsServer.ON_LOBBY_CREATE)
    onServer_LobbyCreate(lobby: string) {
        this.ModLoader.lobbyManager.createLobbyStorage(
            lobby,
            this,
            new Net.DatabaseServer()
        );
    }

    @EventHandler(EventsClient.CONFIGURE_LOBBY)
    onLobbySetup(lobby: LobbyData): void {
        lobby.data['MmOnline:timeless_mode'] = false;
    }

    @EventHandler(EventsClient.ON_LOBBY_JOIN)
    onClient_LobbyJoin(lobby: LobbyData): void {
        this.db = new Net.DatabaseClient();
        this.db.timeless = lobby.data['MmOnline:timeless_mode'];

        // Send our storage request to the server
        let pData = new Packet('RequestStorage', 'MmOnline', this.ModLoader.clientLobby, false);
        this.ModLoader.clientSide.sendPacket(pData);

        // Send our config data
        pData = new SyncConfig(
            this.ModLoader.clientLobby,
            this.db.timeless,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    @EventHandler(EventsServer.ON_LOBBY_JOIN)
    onServer_LobbyJoin(evt: EventServerJoined) {
        let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
        storage.players[evt.player.uuid] = -1;
        storage.playerInstances[evt.player.uuid] = evt.player;
        storage.player_resetting[evt.player.uuid] = false;
    }

    @EventHandler(EventsServer.ON_LOBBY_LEAVE)
    onServer_LobbyLeave(evt: EventServerLeft) {
        let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
        delete storage.players[evt.player.uuid];
        delete storage.playerInstances[evt.player.uuid];
        delete storage.player_resetting[evt.player.uuid];
    }

    @EventHandler(EventsClient.ON_SERVER_CONNECTION)
    onClient_ServerConnection(evt: any) {
        //this.pMgr.reset();
        if (this.core.runtime === undefined || !this.core.isPlaying()) return;
        let pData = new Net.SyncLocation(this.ModLoader.clientLobby, this.curScene)
        this.ModLoader.clientSide.sendPacket(pData);
    }

        @EventHandler(EventsClient.ON_PLAYER_JOIN)
        onPlayerJoin(player: INetworkPlayer) {
            this.overlord.registerPuppet(player);
        }
    
        @EventHandler(EventsClient.ON_PLAYER_LEAVE)
        onPlayerLeft(player: INetworkPlayer) {
        this.overlord.unregisterPuppet(player);
        }

    // #################################################
    // ##  Server Receive Packets
    // #################################################

    @ServerNetworkHandler('RequestStorage')
    onServer_RequestStorage(packet: Packet): void {
        this.ModLoader.logger.info('[Server] Sending: {Lobby Storage}');
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let pData = new Net.SyncStorage(
            packet.lobby,
            sDB.cycle_flags,
            sDB.event_flags,
            sDB.game_flags,
            sDB.owl_flags,
            sDB.intro_state,
            sDB.scene_data,
            sDB.bank,
            sDB.quest_status,
            sDB.health,
            sDB.magic,
            sDB.equips,
            sDB.items,
            sDB.masks,
            sDB.clock,
            sDB.map,
            sDB.game_active
        );
        this.ModLoader.serverSide.sendPacketToSpecificPlayer(pData, packet.player);
    }

    @ServerNetworkHandler('SyncConfig')
    onServer_SyncConfig(packet: Net.SyncConfig): void {
        this.ModLoader.logger.info('[Server] Received: {Lobby Config}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Only overwrite if lobby host
        if (!sDB.hasConfig) {
            sDB.timeless = packet.timeless;

            sDB.hasConfig = true;
            this.ModLoader.logger.info('[Server] Updated: {Lobby Config}');
        }

        // Update everyones config
        let pData = new Net.SyncConfig(
            packet.lobby,
            sDB.timeless,
            true
        );
        this.ModLoader.serverSide.sendPacket(pData);
    }

    @ServerNetworkHandler('SyncTimeReset')
    onServer_SyncTimeReset(packet: Net.SyncTimeReset): void {
        this.ModLoader.logger.info('[Server] Invoked: {Time Reset}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Time sync feature only
        if (sDB.timeless) return;

        // Player is not allowed to send this packet at this time
        if (sDB.player_resetting[packet.player.uuid]) return;

        // Mark all players as resetting
        Object.keys(sDB.player_resetting).forEach((key: string) => {
            sDB.player_resetting[key] = true;
        });

        // Pull game/time data
        sDB.clock = packet.clock;
        sDB.cycle_flags = packet.cycle;
        sDB.event_flags = packet.events;
        Object.keys(sDB.scene_data).forEach((key: string) => {
            sDB.scene_data[key] = new Net.SceneData();
        });

        // Send packet
        let pData = new Net.SyncTimeReset(
            packet.lobby,
            sDB.cycle_flags,
            sDB.event_flags,
            sDB.clock,
            true
        );
        this.ModLoader.serverSide.sendPacket(pData);
    }

    @ServerNetworkHandler('SyncCycleFlags')
    onServer_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Cycle Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Time sync feature only
        if (sDB.timeless) return;

        // Player is not allowed to send this packet at this time
        if (sDB.player_resetting[packet.player.uuid]) return;

        let data: Buffer = sDB.cycle_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.cycle_flags = data;

        let pData = new Net.SyncBuffered(packet.lobby, 'SyncCycleFlags', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Cycle Flags}');
    }

    @ServerNetworkHandler('SyncEventFlags')
    onServer_SyncEventFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Event Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Time sync feature only
        if (sDB.timeless) return;

        // Player is not allowed to send this packet at this time
        if (sDB.player_resetting[packet.player.uuid]) return;

        let data: Buffer = sDB.event_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.event_flags = data;

        let pData = new Net.SyncBuffered(packet.lobby, 'SyncEventFlags', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Event Flags}');
    }

    @ServerNetworkHandler('SyncGameFlags')
    onServer_SyncGameFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Game Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.game_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.game_flags = data;

        let pData = new Net.SyncBuffered(packet.lobby, 'SyncGameFlags', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Game Flags}');
    }

    @ServerNetworkHandler('SyncOwlFlags')
    onServer_SyncOwlFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Owl Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.owl_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.owl_flags = data;

        let pData = new Net.SyncBuffered(packet.lobby, 'SyncOwlFlags', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Owl Flags}');
    }

    @ServerNetworkHandler('SyncIntroState')
    onServer_SyncIntroState(packet: Net.SyncNumbered) {
        this.ModLoader.logger.info('[Server] Received: {Intro State Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: number = sDB.intro_state;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (data >= packet.value) return;
        sDB.intro_state = packet.value;

        let pData = new Net.SyncNumbered(packet.lobby, 'SyncIntroState', packet.value, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Intro State Flags}');
    }

    @ServerNetworkHandler('SyncSceneData')
    onServer_SyncSceneData(packet: Net.SyncSceneData) {
        this.ModLoader.logger.info('[Server] Received: {Scene Data}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Time sync feature only
        if (sDB.timeless) return;

        // Player is not allowed to send this packet at this time
        if (sDB.player_resetting[packet.player.uuid]) return;

        // Ensure we have this scene data!
        this.check_db_instance(sDB, packet.scene);

        let data: Buffer = (sDB.scene_data[packet.scene] as Net.SceneData).flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.flags[i]) continue;
            data[i] |= packet.flags[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.scene_data[packet.scene].flags = data;

        let pData = new Net.SyncSceneData(packet.lobby, packet.scene, data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Scene Flags}');
    }

    @ServerNetworkHandler('SyncBank')
    onServer_SyncBank(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Server] Received: {Bank Balance}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let count: number = sDB.bank;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (count !== packet.value) needUpdate = true;

        if (!needUpdate) return;

        sDB.bank = packet.value;

        this.ModLoader.logger.info('[Server] Updated: {Bank Balance}');
    }

    @ServerNetworkHandler('SyncQuestStatus')
    onServer_SyncQuestStatus(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Server] Received: {Quest Status}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let status: number = sDB.quest_status;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (status !== packet.value) {
            status |= packet.value;
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.quest_status = status;

        // Send changes to clients
        let pData = new Net.SyncNumbered(packet.lobby, 'SyncQuestStatus', status, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Quest Status}');
    }

    @ServerNetworkHandler('SyncHealth')
    onServer_SyncHealth(packet: Net.SyncHealth): void {
        this.ModLoader.logger.info('[Server] Received: {Health}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let health: Net.HealthData = sDB.health;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (health.containers < packet.containers) {
            health.containers = packet.containers;
            needUpdate = true;
        }

        if (health.double_defense < packet.double_defense) {
            health.double_defense = packet.double_defense;
            needUpdate = true;
        }

        if (health.pieces !== packet.pieces) {
            health.pieces = packet.pieces;
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.health = health;

        // Send changes to clients
        let pData = new Net.SyncHealth(
            packet.lobby,
            health.containers,
            health.double_defense,
            health.pieces,
            true
        );
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Health}');
    }

    @ServerNetworkHandler('SyncMagic')
    onServer_SyncMagic(packet: Net.SyncMagic): void {
        this.ModLoader.logger.info('[Server] Received: {Magic}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let magic: Net.MagicData = sDB.magic;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (magic.bar < packet.bar) {
            magic.bar = packet.bar;
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.magic = magic;

        // Send changes to clients
        let pData = new Net.SyncMagic(packet.lobby, magic.bar, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Magic}');
    }

    @ServerNetworkHandler('SyncEquipSlots')
    onServer_SyncEquipSlots(packet: Net.SyncEquipSlots): void {
        this.ModLoader.logger.info('[Server] Received: {Equip Slots}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let equips: Net.EquipData = sDB.equips;
        let val1: number;
        let val2: number;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (equips.sword < packet.equips.sword) {
            equips.sword = packet.equips.sword;
            needUpdate = true;
        }

        if (equips.shield < packet.equips.shield) {
            equips.shield = packet.equips.shield;
            needUpdate = true;
        }

        val1 = equips.bomb_bag !== 255 ? equips.bomb_bag : -1;
        val2 = packet.equips.bomb_bag !== 255 ? packet.equips.bomb_bag : -1;

        if (val1 > val2) {
            needUpdate = true;
        } else if (val1 < val2) {
            equips.bomb_bag = packet.equips.bomb_bag;
            needUpdate = true;
        }

        val1 = equips.quiver !== 255 ? equips.quiver : -1;
        val2 = packet.equips.quiver !== 255 ? packet.equips.quiver : -1;

        if (val1 > val2) {
            needUpdate = true;
        } else if (val1 < val2) {
            equips.quiver = packet.equips.quiver;
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.equips = equips;

        // Send changes to clients
        let pData = new Net.SyncEquipSlots(packet.lobby, equips, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Equip Slots}');
    }

    @ServerNetworkHandler('SyncItemSlots')
    onServer_SyncItemSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Server] Received: {Item Slots}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.items;
        let val1 = 0;
        let val2 = 0;
        let i = 0;
        let n = 0;
        let x = 0;
        let y = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        // Normal items with upgrades
        for (i = 0; i < 3; i++) {
            x = i * 6;
            for (n = 0; n < 5; n++) {
                y = x + n;
                val1 = data[y] !== 255 ? data[y] : -1;
                val2 = packet.value[y] !== 255 ? packet.value[y] : -1;

                if (val1 < val2) {
                    data[y] = packet.value[y];
                    needUpdate = true;
                }
            }
        }

        // Trade Items
        if (data[0x05] !== packet.value[0x05]) {
            data[0x05] = packet.value[0x05];
            needUpdate = true;
        }
        if (data[0x0b] !== packet.value[0x0b]) {
            data[0x0b] = packet.value[0x0b];
            needUpdate = true;
        }
        if (data[0x11] !== packet.value[0x11]) {
            data[0x11] = packet.value[0x11];
            needUpdate = true;
        }

        // Bottles
        for (i = 0x12; i < 0x18; i++) {
            val1 = data[i] !== 255 ? data[i] : -1;
            val2 = packet.value[i] !== 255 ? packet.value[i] : -1;

            if (val1 !== val2 && val2 > -1) {
                data[i] = packet.value[i];
                needUpdate = true;
            }
        }

        if (!needUpdate) return;

        sDB.items = data;

        // Send changes to clients
        let pData = new Net.SyncBuffered(packet.lobby, 'SyncItemSlots', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Item Slots}');
    }

    @ServerNetworkHandler('SyncMaskSlots')
    onServer_SyncMaskSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Server] Received: {Mask Slots}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.masks;
        let count: number = data.byteLength;
        let val1 = 0;
        let val2 = 0;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        for (i = 0; i < count; i++) {
            val1 = data[i] !== 255 ? data[i] : -1;
            val2 = packet.value[i] !== 255 ? packet.value[i] : -1;

            if (val1 < val2) {
                data[i] = packet.value[i];
                needUpdate = true;
            }
        }

        if (!needUpdate) return;

        sDB.masks = data;

        // Send changes to clients
        let pData = new Net.SyncBuffered(packet.lobby, 'SyncMaskSlots', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Mask Slots}');
    }

    @ServerNetworkHandler('SyncClock')
    onServer_SyncClock(packet: Net.SyncClock): void {
        this.ModLoader.logger.info('[Server] Received: {Clock}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Time sync feature only
        if (sDB.timeless) return;

        // Player is not allowed to send this packet at this time
        if (sDB.player_resetting[packet.player.uuid]) return;

        let timeData = Math.floor(sDB.clock.time / 0x1000);
        let timeStorage = Math.floor(packet.clock.time / 0x1000);
        let needUpdate: boolean = false;

        // Compare major changes
        if (sDB.clock.current_day !==
            packet.clock.current_day) needUpdate = true;

        if (sDB.clock.elapsed !==
            packet.clock.elapsed) needUpdate = true;

        if (sDB.clock.is_night !==
            packet.clock.is_night) needUpdate = true;

        if (sDB.clock.speed !==
            packet.clock.speed) needUpdate = true;

        if (timeData !== timeStorage) needUpdate = true;

        if (!needUpdate) return;

        sDB.clock = packet.clock;

        // Ensure game_active check completed        
        sDB.game_active = true;

        this.ModLoader.logger.info('[Server] Updated: {Clock}');
    }

    @ServerNetworkHandler('SyncMap')
    onServer_SyncMap(packet: Net.SyncMap): void {
        this.ModLoader.logger.info('[Server] Received: {Map}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let map: Net.MapData = sDB.map;
        let needUpdate = false;

        // Ensure game_active check completed        
        sDB.game_active = true;

        if (map.visible !== packet.visible) {
            map.visible &= packet.visible;
            needUpdate = true;
        }

        if (map.visited !== packet.visited) {
            map.visited &= packet.visited;
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.map = map;

        // Send changes to clients
        let pData = new Net.SyncMap(packet.lobby, map.visible, map.visited, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {map}');
    }

    // Puppet Tracking

    @ServerNetworkHandler('SyncLocation')
    onServer_SyncLocation(packet: Net.SyncLocation) {
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let pMsg = 'Player[' + packet.player.nickname + ']';
        let sMsg = 'Scene[' + packet.scene + ']';
        sDB.players[packet.player.uuid] = packet.scene;
        this.ModLoader.logger.info('[Server] Received: {Player Scene}');
        this.ModLoader.logger.info('[Server] Updated: ' + pMsg + ' to ' + sMsg);
        this.check_db_instance(sDB, packet.scene);

        // Determine if safe to receive time data from player again
        if (packet.scene === 0x6f) sDB.player_resetting[packet.player.uuid] = false;
    }

    // @ServerNetworkHandler('SyncPuppet')
    // onServer_SyncPuppet(packet: Net.SyncPuppet) {
    //     let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
    //     Object.keys(sDB.players).forEach((key: string) => {
    //         if (sDB.players[key] !== sDB.players[packet.player.uuid]) {
    //             return;
    //         }

    //         if (!sDB.playerInstances.hasOwnProperty(key)) return;
    //         if (sDB.playerInstances[key].uuid === packet.player.uuid) {
    //             return;
    //         }

    //         this.ModLoader.serverSide.sendPacketToSpecificPlayer(
    //             packet,
    //             sDB.playerInstances[key]
    //         );
    //     });
    // }

    tmp() { }

    // #################################################
    // ##  Client Receive Packets
    // #################################################

    @NetworkHandler('SyncStorage')
    onClient_SyncStorage(packet: Net.SyncStorage): void {
        this.ModLoader.logger.info('[Client] Received: {Lobby Storage}');
        this.db.cycle_flags = packet.cycle_flags;
        this.db.event_flags = packet.event_flags;
        this.db.game_flags = packet.game_flags;
        this.db.owl_flags = packet.owl_flags;
        this.db.intro_state = packet.intro_state;
        this.db.scene_data = packet.scene_data;
        this.db.bank = packet.bank;
        this.db.quest_status = packet.quest_status;
        this.db.magic = packet.magic;
        this.db.equips = packet.equips;
        this.db.items = packet.items;
        this.db.masks = packet.masks;
        this.db.clock = packet.clock;
        this.db.map = packet.map;
        this.db.game_active = packet.game_active;
    }

    @NetworkHandler('SyncConfig')
    onClient_SyncConfig(packet: Net.SyncConfig) {
        this.ModLoader.logger.info('[Client] Updated: {Lobby Config}');

        this.db.timeless = packet.timeless;
    }

    @NetworkHandler('SyncTimeReset')
    onClient_SyncTimeReset(packet: Net.SyncTimeReset): void {
        this.ModLoader.logger.info('[Client] Invoked: {Time Reset}');

        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let inv: Buffer;
        let i: number;

        this.db.cycle_flags = packet.cycle;
        this.db.event_flags = packet.events;
        Object.keys(this.db.scene_data).forEach((key: string) => {
            this.db.scene_data[key] = new Net.SceneData();
        });

        if (this.core.isPlaying()) {
            this.core.save.cycle_flags.set_all(packet.cycle);
            this.core.save.event_flags.set_all(packet.events);
            this.core.runtime.scene_flags.set_all(Buffer.alloc(0x14));

            inv = this.core.save.item_slots.array;

            // Nuke trade items
            inv[0x05] = 255;
            inv[0x0b] = 255;
            inv[0x11] = 255;

            // Empty bottles
            for (i = 0x12; i < 0x18; i++) {
                if (inv[i] !== 255)
                    inv[i] = API.ItemType.BOTTLE_EMPTY;
            }

            this.core.save.item_slots.array = inv;
            this.db.items = inv;
        } else {
            this.db.items.fill(-1);
        }

        if (!this.db.time_reset) {
            this.db.clock = packet.clock;
            this.db.clock_need_update = true;

            if (this.core.isPlaying()) {
                this.curScene = 0x08;
                this.ModLoader.clientSide.sendPacket(new Net.SyncLocation(
                    this.ModLoader.clientLobby,
                    0x08
                ));
                this.core.runtime.goto_scene(0x0000D800);
            }
        }
    }

    @NetworkHandler('SyncCycleFlags')
    onClient_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Cycle Flags}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Time sync feature only
        if (this.db.timeless) return;

        let data: Buffer = this.db.cycle_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.cycle_flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Cycle Flags}');
    }

    @NetworkHandler('SyncEventFlags')
    onClient_SyncEventFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Event Flags}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Time sync feature only
        if (this.db.timeless) return;

        let data: Buffer = this.db.event_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.event_flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Event Flags}');
    }

    @NetworkHandler('SyncGameFlags')
    onClient_SyncGameFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Game Flags}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        let data: Buffer = this.db.game_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.game_flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Game Flags}');
    }

    @NetworkHandler('SyncOwlFlags')
    onClient_SyncOwlFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Owl Flags}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        let data: Buffer = this.db.owl_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.owl_flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Owl Flags}');
    }

    @NetworkHandler('SyncIntroState')
    onClient_SyncIntroState(packet: Net.SyncNumbered) {
        this.ModLoader.logger.info('[Client] Received: {Intro State Flags}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        let data: number = this.db.intro_state;
        if (data >= packet.value) return;
        this.db.intro_state = packet.value;

        this.ModLoader.logger.info('[Client] Updated: {Intro State Flags}');
    }

    @NetworkHandler('SyncSceneData')
    onClient_SyncSceneData(packet: Net.SyncSceneData) {
        this.ModLoader.logger.info('[Client] Received: {Scene Flags}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Time sync feature only
        if (this.db.timeless) return;

        // Ensure we have this scene data!
        this.check_db_instance(this.db, packet.scene);

        let data: Buffer = (this.db.scene_data[packet.scene] as Net.SceneData).flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.flags[i]) continue;
            data[i] |= packet.flags[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.scene_data[packet.scene].flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Scene Flags}');
    }

    @NetworkHandler('SyncBank')
    onClient_SyncBank(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Client] Received: {Bank Balance}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let count: number = this.db.bank;
        let needUpdate = false;

        if (count !== packet.value) needUpdate = true;

        if (!needUpdate) return;

        this.db.bank = packet.value;
        this.db.bank_need_update = true;

        this.ModLoader.logger.info('[Client] Updated: {Bank Balance}');
    }

    @NetworkHandler('SyncQuestStatus')
    onClient_SyncQuestStatus(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Client] Received: {Quest Status}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let status: number = this.db.quest_status;
        let needUpdate = false;

        if (status !== packet.value) {
            status |= packet.value;
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.quest_status = status;

        this.ModLoader.logger.info('[Client] Updated: {Quest Status}');
    }

    @NetworkHandler('SyncHealth')
    onClient_SyncHealth(packet: Net.SyncHealth): void {
        this.ModLoader.logger.info('[Client] Received: {Health}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let health: Net.HealthData = this.db.health;
        let needUpdate = false;

        if (health.containers < packet.containers) {
            health.containers = packet.containers;
            needUpdate = true;
        }

        if (health.double_defense < packet.double_defense) {
            health.double_defense = packet.double_defense;
            needUpdate = true;
        }

        if (health.pieces !== packet.pieces) {
            health.pieces = packet.pieces;
            needUpdate = true;
            this.db.health_need_update = true;
        }

        if (!needUpdate) return;

        this.db.health = health;

        this.ModLoader.logger.info('[Client] Updated: {Health}');
    }

    @NetworkHandler('SyncMagic')
    onClient_SyncMagic(packet: Net.SyncMagic): void {
        this.ModLoader.logger.info('[Client] Received: {Magic}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let magic: Net.MagicData = this.db.magic;
        let needUpdate = false;

        if (magic.bar < packet.bar) {
            magic.bar = packet.bar;
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.magic = magic;

        this.ModLoader.logger.info('[Client] Updated: {Magic}');
    }

    @NetworkHandler('SyncEquipSlots')
    onClient_SyncEquipSlots(packet: Net.SyncEquipSlots): void {
        this.ModLoader.logger.info('[Client] Received: {Equip Slots}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let equips: Net.EquipData = this.db.equips;
        let val1: number;
        let val2: number;
        let needUpdate = false;

        if (equips.sword < packet.equips.sword) {
            equips.sword = packet.equips.sword;
            needUpdate = true;
        }

        if (equips.shield < packet.equips.shield) {
            equips.shield = packet.equips.shield;
            needUpdate = true;
        }

        val1 = equips.bomb_bag !== 255 ? equips.bomb_bag : -1;
        val2 = packet.equips.bomb_bag !== 255 ? packet.equips.bomb_bag : -1;

        if (val1 > val2) {
            needUpdate = true;
        } else if (val1 < val2) {
            equips.bomb_bag = packet.equips.bomb_bag;
            needUpdate = true;
        }

        val1 = equips.quiver !== 255 ? equips.quiver : -1;
        val2 = packet.equips.quiver !== 255 ? packet.equips.quiver : -1;

        if (val1 > val2) {
            needUpdate = true;
        } else if (val1 < val2) {
            equips.quiver = packet.equips.quiver;
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.equips = equips;

        this.ModLoader.logger.info('[Client] Updated: {Equip Slots}');
    }

    @NetworkHandler('SyncItemSlots')
    onClient_SyncItemSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Client] Received: {Item Slots}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let data: Buffer = this.db.items;
        let val1 = 0;
        let val2 = 0;
        let i = 0;
        let n = 0;
        let x = 0;
        let y = 0;
        let needUpdate = false;

        // Normal items with upgrades
        for (i = 0; i < 3; i++) {
            x = i * 6;
            for (n = 0; n < 5; n++) {
                y = x + n;
                val1 = data[y] !== 255 ? data[y] : -1;
                val2 = packet.value[y] !== 255 ? packet.value[y] : -1;

                if (val1 < val2) {
                    data[y] = packet.value[y];
                    needUpdate = true;
                }
            }
        }

        // Time sync version
        if (!this.db.timeless) {
            // Trade Items
            if (data[0x05] !== packet.value[0x05]) {
                data[0x05] = packet.value[0x05];
                needUpdate = true;
                this.db.trade_need_update = true;
            }
            if (data[0x0b] !== packet.value[0x0b]) {
                data[0x0b] = packet.value[0x0b];
                needUpdate = true;
                this.db.trade_need_update = true;
            }
            if (data[0x11] !== packet.value[0x11]) {
                data[0x11] = packet.value[0x11];
                needUpdate = true;
                this.db.trade_need_update = true;
            }

            // Bottles
            for (i = 0x12; i < 0x18; i++) {
                val1 = data[i] !== 255 ? data[i] : -1;
                val2 = packet.value[i] !== 255 ? packet.value[i] : -1;

                if (val1 !== val2 && val2 > -1) {
                    data[i] = packet.value[i];
                    needUpdate = true;
                    this.db.bottles_need_update = true;
                }
            }
        }
        // Timeless version
        else {
            // If a new bottle was collected that we dont have give empty bottles
            if (data[0x12] === 255 && packet.value[0x12] !== 255) {
                data[0x12] = API.ItemType.BOTTLE_EMPTY;
                needUpdate = true;
            }
            if (data[0x13] === 255 && packet.value[0x13] !== 255) {
                data[0x13] = API.ItemType.BOTTLE_EMPTY;
                needUpdate = true;
            }
            if (data[0x14] === 255 && packet.value[0x14] !== 255) {
                data[0x14] = API.ItemType.BOTTLE_EMPTY;
                needUpdate = true;
            }
            if (data[0x15] === 255 && packet.value[0x15] !== 255) {
                data[0x15] = API.ItemType.BOTTLE_EMPTY;
                needUpdate = true;
            }
            if (data[0x16] === 255 && packet.value[0x16] !== 255) {
                data[0x16] = API.ItemType.BOTTLE_EMPTY;
                needUpdate = true;
            }
            if (data[0x17] === 255 && packet.value[0x17] !== 255) {
                data[0x17] = API.ItemType.BOTTLE_EMPTY;
                needUpdate = true;
            }
        }

        if (!needUpdate) return;

        this.db.items = data;

        this.ModLoader.logger.info('[Client] Updated: {Item Slots}');
    }

    @NetworkHandler('SyncMaskSlots')
    onClient_SyncMaskSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Client] Received: {Mask Slots}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let data: Buffer = this.db.masks;
        let count: number = data.byteLength;
        let val1 = 0;
        let val2 = 0;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            val1 = data[i] !== 255 ? data[i] : -1;
            val2 = packet.value[i] !== 255 ? packet.value[i] : -1;

            if (val1 < val2) {
                data[i] = packet.value[i];
                needUpdate = true;
            }
        }

        if (!needUpdate) return;

        this.db.masks = data;

        this.ModLoader.logger.info('[Client] Updated: {Mask Slots}');
    }

    @NetworkHandler('SyncClock')
    onClient_SyncClock(packet: Net.SyncClock): void {
        this.ModLoader.logger.info('[Client] Received: {Clock}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let timeData = Math.floor(this.db.clock.time / 0x1000);
        let timeStorage = Math.floor(packet.clock.time / 0x1000);
        let needUpdate: boolean = false;

        // Compare major changes
        if (this.db.clock.current_day !==
            packet.clock.current_day) needUpdate = true;

        if (this.db.clock.elapsed !==
            packet.clock.elapsed) needUpdate = true;

        if (this.db.clock.is_night !==
            packet.clock.is_night) needUpdate = true;

        if (this.db.clock.speed !==
            packet.clock.speed) needUpdate = true;

        if (timeData !== timeStorage) needUpdate = true;

        if (!needUpdate) return;

        this.db.clock = packet.clock;
        this.db.clock_live = packet.clock;
        this.db.clock_need_update = true;

        this.ModLoader.logger.info('[Client] Updated: {Clock}');
    }

    @NetworkHandler('SyncMap')
    onClient_SyncMap(packet: Net.SyncMap): void {
        this.ModLoader.logger.info('[Client] Received: {Map}');

        // Ensure game_active check completed        
        this.db.game_active = true;

        // Initializers
        let map: Net.MapData = this.db.map;
        let needUpdate = false;

        if (map.visible !== packet.visible) {
            map.visible &= packet.visible;
            needUpdate = true;
        }

        if (map.visited !== packet.visited) {
            map.visited &= packet.visited;
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.map = map;

        this.ModLoader.logger.info('[Client] Updated: {Map}');
    }

    // Puppet Tracking


    //------------------------------
    // Puppet handling
    //------------------------------

    sendPacketToPlayersInScene(packet: IPacketHeader) {
        try {
        let storage: Storage = this.ModLoader.lobbyManager.getLobbyStorage(
            packet.lobby,
            this
        ) as Storage;
        Object.keys(storage.players).forEach((key: string) => {
            if (storage.players[key] === storage.players[packet.player.uuid]) {
            if (storage.networkPlayerInstances[key].uuid !== packet.player.uuid) {
                this.ModLoader.serverSide.sendPacketToSpecificPlayer(
                packet,
                storage.networkPlayerInstances[key]
                );
            }
            }
        });
        } catch (err) {}
    }

    @EventHandler(MMEvents.ON_SCENE_CHANGE)
    onSceneChange(scene: number, packet: SyncPlayerData ) {
      this.overlord.localPlayerLoadingZone();
      this.overlord.localPlayerChangingScenes(scene, packet.form);
      this.ModLoader.clientSide.sendPacket(
        new SyncPlayerData(
          this.ModLoader.clientLobby,
          scene, packet.player, packet.form, true
        )
      );
      this.ModLoader.logger.info('client: I moved to scene ' + scene + '.');
    }

    @ServerNetworkHandler('MmO_ScenePacket')
    onSceneChange_server(packet: IPacketHeader) {
      let storage: Storage = this.ModLoader.lobbyManager.getLobbyStorage(
        packet.lobby,
        this
      ) as Storage;
    }
  
    @NetworkHandler('MmO_ScenePacket')
    onSceneChange_client(packet: SyncPlayerData) {
      this.overlord.changePuppetScene(packet.player, packet.scene, packet.form);
      bus.emit(
        MmOnlineEvents.CLIENT_REMOTE_PLAYER_CHANGED_SCENES,
        new SyncPlayerData(
            this.ModLoader.clientLobby,
            packet.scene, packet.player, packet.form, true
          )
       );
    }


    @ServerNetworkHandler('MmO_PuppetPacket')
    onPuppetData_server(packet: MmO_PuppetPacket) {
        this.sendPacketToPlayersInScene(packet);
    }

    @NetworkHandler('MmO_PuppetPacket')
    onPuppetData_client(packet: MmO_PuppetPacket) {
        if (
        this.core.isTitleScreen ||
        this.core.helper.isPaused() ||
        this.core.helper.entering_zone()
        ) {
        return;
        }
        this.overlord.processPuppetPacket(packet);
    }

    @EventHandler(EventsClient.ON_PAYLOAD_INJECTED)
    onPayload(evt: any) {
    if (evt.file === 'link_puppet.ovl') {
      this.ModLoader.utils.setTimeoutFrames(() => {
        this.ModLoader.emulator.rdramWrite16(0x600140, evt.result);
        console.log('Setting link puppet id to ' + evt.result + '.');
      }, 20);
    } 
  }
}

class find_init {
    constructor() {}

    find(buf: Buffer, locate: string): number {
        let loc: Buffer = Buffer.from(locate, 'hex');
        if (buf.indexOf(loc) > -1) {
            return buf.indexOf(loc);
        }
        return -1;
    }
}

interface ovl_meta {
  addr: string;
  init: string;
}

export class OverlayPayload extends PayloadType {
    constructor(ext: string) {
        super(ext);
    }

    parse(file: string, buf: Buffer, dest: Buffer) {
        console.log('Trying to allocate actor...');
        let overlay_start: number = 0x1AEFD0;
        let size = 0x02b1;
        let empty_slots: number[] = new Array<number>();
        for (let i = 0; i < size; i++) {
            let entry_start: number = overlay_start + i * 0x20;
            let _i: number = dest.readUInt32BE(entry_start + 0x14);
            let total = 0;
            total += _i;
            if (total === 0) {
                empty_slots.push(i);
            }
        }
        console.log(empty_slots.length + ' empty actor slots found.');
        let finder: find_init = new find_init();
        let meta: ovl_meta = JSON.parse(
            fs
                .readFileSync(
                    path.join(path.parse(file).dir, path.parse(file).name + '.json')
                )
                .toString()
        );
        let offset: number = finder.find(buf, meta.init);
        if (offset === -1) {
            console.log(
                'Failed to find spawn parameters for actor ' +
          path.parse(file).base +
          '.'
            );
            return -1;
        }
        let addr: number = parseInt(meta.addr) + offset;
        let slot: number = empty_slots.shift() as number;
        console.log(
            'Assigning ' + path.parse(file).base + ' to slot ' + slot + '.'
        );
        dest.writeUInt32BE(0x80000000 + addr, slot * 0x20 + overlay_start + 0x14);
        buf.writeUInt8(slot, offset + 0x1);
        buf.copy(dest, parseInt(meta.addr));
        return slot;
    }
    
}
