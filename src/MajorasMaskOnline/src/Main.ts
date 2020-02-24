
import fs from 'fs';
import path from 'path';
import {
    EventHandler,
    EventsClient,
    EventServerJoined,
    EventServerLeft,
    EventsServer,
} from 'modloader64_api/EventHandler';
import { IModLoaderAPI, IPlugin, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
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
import { PayloadType } from 'modloader64_api/PayloadType';
import { Z64RomTools } from 'Z64Lib/API/Z64RomTools';
import { zzstatic } from './puppets/models/zzstatic/src/zzstatic';
import * as API from 'MajorasMask/API/Imports';
import * as Net from './network/Imports';
import * as Puppet from './puppets/Imports';

export interface IConfig {
    timeless_mode: boolean;
    print_events: boolean;
}

export class MmOnline implements IPlugin {
    ModLoader = {} as IModLoaderAPI;
    name = 'MmOnline';

    @InjectCore() core!: API.IMMCore;

    // Storage Variables
    rom!: Buffer;
    db = new Net.DatabaseClient();

    // Helpers
    pMgr!: Puppet.PuppetManager;
    protected curScene: number = -1;

    configPath: string = './MajorasMaskOnline.json';
    config: IConfig = {
        timeless_mode: false,
        print_events: false
    };

    scene_name(scene: number): string {
        let val = scene & 0x000000ff;
        if (val > 0x70) return val.toString(16);
        else return API.SceneType[val];
    }

    reset_session() {
        if (!this.db.timeless) {
            this.db.clock_need_update = true;
            this.db.cycle_need_update = true;
            this.db.event_need_update = true;
        }

        if (this.db.has_game_plyr) {
            this.db.bank_need_update = true;
            this.db.health_need_update = true;
            this.db.keys_need_update = true;
            this.db.trade_need_update = true;
            this.db.bottles_need_update = true;
        }
    }

    check_db_instance(db: Net.Database, scene: number) {
        // Spawn missing scene variable!
        if (db.hasOwnProperty(scene)) return;
        db.scene_data[scene] = new Net.SceneData();
    }

    handle_reset_time(scene: number, cutscene: number) {
        if (scene === this.curScene) return;

        // Make sure we are on cutscene map
        if (scene !== API.SceneType.VARIOUS_CUTSCENES) return;

        // Make sure we are invoking ocarina reset time
        if (!((this.db.is_rando && cutscene === 0x8072e1d0) ||
            cutscene === 0x8072d7d0)) return;

        // Time sync feature only -- Only fix inventory
        if (this.db.timeless) {
            this.db.items = this.core.save.item_slots.array;
            return;
        }

        // Only progress if we havent invoked a time reset
        if (this.db.time_reset) return;

        this.db.time_reset = true;

        let pData = new Net.SyncTimeReset(
            this.ModLoader.clientLobby,
            this.db.cycle_bak,
            this.db.event_bak,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_scene_change(scene: number, form: number, timeCard: boolean) {
        if (scene === this.curScene) {
            if (form !== this.db.last_form) {
                this.db.last_form = form;
                this.ModLoader.clientSide.sendPacket(
                    new Net.SyncLocation(
                        this.ModLoader.clientLobby,
                        this.ModLoader.me,
                        scene,
                        form
                    )
                );
                this.ModLoader.logger.info('[Tick] Changed forms[' + API.FormType[form] + '].');
            }
            return;
        }

        // Clock can begin functioning
        if (timeCard) this.db.time_reset = false;

        // Set global to current scene value
        this.curScene = scene;

        // Ensure we have this scene data!
        this.check_db_instance(this.db, scene);

        // Alert scene change!
        this.ModLoader.clientSide.sendPacket(
            new Net.SyncLocation(
                this.ModLoader.clientLobby,
                this.ModLoader.me,
                scene,
                form
            )
        );

        if (scene !== -1)
            this.ModLoader.logger.info('[Tick] Moved to scene[' + this.scene_name(scene) + '].');
    }

    handle_puppets(scene: number, isSafe: boolean) {
        if (!isSafe) scene = -1;
        this.pMgr.scene = scene;

        if (this.core.runtime.scene_frame > 0) this.pMgr.onTick(isSafe);
    }

    handle_cycle_flags(bufData: Buffer, bufStorage: Buffer) {
        // Time sync feature only
        if (this.db.timeless) return;

        if (this.db.cycle_need_update) {
            this.core.save.cycle_flags.set_all(this.db.cycle_flags);

            this.db.cycle_need_update = false;
            return;
        }

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
        // Time sync feature only
        if (this.db.timeless) return;

        if (this.db.event_need_update) {
            this.core.save.event_flags.set_all(this.db.event_flags);

            this.db.event_need_update = false;
            return;
        }

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

                if (this.config.print_events)
                    this.ModLoader.logger.info('Event: [' + i + '] triggered.');
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

    handle_intro_flag(scene: number, timeCard: boolean) {
        // Initializers
        let pData: Net.SyncNumbered;
        let stateData: number;
        let stateStorage: number

        stateData = this.core.save.intro_flag;
        stateStorage = this.db.intro_state;

        if (!this.db.in_game) {
            // Delay checks
            if (this.db.intro_buffer < 20) {
                this.db.intro_buffer += 1;
                return;
            }

            // Dont record entry time on timeCard
            if (timeCard) return;

            // First player check
            if (this.db.has_game_plyr) {
                // Check for new profile
                if (!this.db.is_rando && stateData < stateStorage) {
                    this.core.save.intro_flag = stateStorage;
                    this.core.save.have_tatl = true;
                    this.core.player.current_form = API.FormType.DEKU;

                    // Warp to clock tower entrance
                    this.core.runtime.goto_scene(0x0000D800);
                }
            } else this.db.clock.time += 1;

            // Alert player is in game!
            this.db.in_game = true;
            this.db.has_game_plyr = true;
            this.ModLoader.clientSide.sendPacket(
                new Packet('SyncPlayerInGame', 'MmOnline', this.ModLoader.clientLobby, true)
            );
        }

        // Notify intro complete
        if (stateData > stateStorage) {
            this.db.intro_state = stateData;

            pData = new Net.SyncNumbered(this.ModLoader.clientLobby, 'SyncIntroState', stateData, false);
            this.ModLoader.clientSide.sendPacket(pData);
        }
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

    handle_clock(scene: number, timeCard: boolean) {
        // Time sync feature only
        if (this.db.timeless) return;

        // First player time card fix
        if (!this.db.has_game_plyr) return;

        // In-Game time card fix
        if (this.db.in_game && timeCard) {
            //if (this.ModLoader.emulator.rdramRead8(0x1C6A7D) !== 0xff) { // Stored song value -- wasnt working -- needs investigation
                //console.log("KILLING TIME!");
                return;
            //}
        }

        if (this.db.clock_need_update) {
            this.core.save.clock.current_day = this.db.clock.current_day;
            this.core.save.clock.elapsed = this.db.clock.elapsed;
            this.core.save.clock.current_day = this.db.clock.current_day;
            this.core.save.clock.elapsed = this.db.clock.elapsed;
            this.core.save.clock.is_night = this.db.clock.is_night;
            this.core.save.clock.speed = this.db.clock.speed;
            this.core.save.clock.time = this.db.clock.time;
            this.db.clock_live = this.db.clock;
            this.db.clock_need_update = false;
            return;
        }

        // Initializers
        let clock = new Net.ClockData();
        clock.current_day = this.core.save.clock.current_day;
        clock.elapsed = this.core.save.clock.elapsed;
        clock.is_night = this.core.save.clock.is_night;
        clock.speed = this.core.save.clock.speed;
        clock.time = this.core.save.clock.time;

        let pData: Net.SyncClock;
        let timeData = Math.floor(clock.time / 0x1000);
        let timeStorage = Math.floor(this.db.clock.time / 0x1000);
        let needUpdate: boolean = false;

        // Check for the time being pressed a day forward
        {
            if (
                (clock.current_day === this.db.clock_live.current_day + 1 ||
                    clock.elapsed === this.db.clock_live.elapsed + 1) &&
                clock.time === this.db.clock_live.time &&
                this.db.clock_live.is_night == false &&
                clock.is_night === false) {
                this.db.clock = clock;
                this.db.clock_live = clock;
                return;
            }
        }

        // Check time to backup data when save is invoked
        {
            if (
                clock.current_day < this.db.clock_live.current_day ||
                clock.elapsed < this.db.clock_live.elapsed ||
                clock.time < this.db.clock_live.time ||
                clock.is_night !== this.db.clock_live.is_night
            ) {
                this.db.cycle_bak = this.core.save.cycle_flags.get_all();
                this.db.event_bak = this.core.save.event_flags.get_all();
            }

            this.db.clock_live = clock;
        }

        // Compare major changes
        if (clock.current_day !== this.db.clock.current_day) needUpdate = true;
        if (clock.elapsed !== this.db.clock.elapsed) needUpdate = true;
        if (clock.is_night !== this.db.clock.is_night) needUpdate = true;
        if (clock.speed !== this.db.clock.speed) needUpdate = true;
        if (timeData !== timeStorage) needUpdate = true;

        // Process Changes
        if (!needUpdate) return;

        // Save time
        this.db.clock = clock;

        // console.log('#################################')
        // console.log('CLOCK:   ')
        // console.log('CLOCK:   ' + this.db.clock.current_day)
        // console.log('CLOCK:   ' + this.db.clock.elapsed)
        // console.log('CLOCK:   ' + this.db.clock.is_night)
        // console.log('CLOCK:   ' + this.db.clock.speed)
        // console.log('CLOCK:   ' + this.db.clock.time)
        // console.log('CLOCK:   ')
        // console.log('#################################')

        // Send time
        pData = new Net.SyncClock(this.ModLoader.clientLobby, clock, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_dungeon() {
        // Time sync feature only
        if (this.db.timeless) return;

        if (this.db.keys_need_update) {
            this.core.save.dungeon_keys.raw = this.db.dungeon.keys;
            this.db.keys_need_update = false;
        }

        // Initializers
        let fairies = this.core.save.dungeon_fairies.raw;
        let items = this.core.save.dungeon_items.raw;
        let keys = this.core.save.dungeon_keys.raw;
        let needUpdate = false;

        if (fairies < this.db.dungeon.fairies) {
            this.core.save.dungeon_fairies.raw = this.db.dungeon.fairies;
        } else if (fairies > this.db.dungeon.fairies) {
            this.db.dungeon.fairies = fairies;
            needUpdate = true;
        }

        if (items < this.db.dungeon.items) {
            this.core.save.dungeon_items.raw = this.db.dungeon.items;
        } else if (items > this.db.dungeon.items) {
            this.db.dungeon.items = items;
            needUpdate = true;
        }

        if (keys !== this.db.dungeon.keys) {
            this.db.dungeon.keys = keys;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        // Send changes to server
        let pData = new Net.SyncDungeon(
            this.ModLoader.clientLobby,
            this.db.dungeon.fairies,
            this.db.dungeon.items,
            this.db.dungeon.keys,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);

    }

    handle_health() {
        if (this.db.health_need_update) {
            this.core.save.health.pieces = this.db.health.pieces;
            this.core.save.health.hearts = this.db.health.containers;
            this.db.health_need_update = false;
        }

        // Initializers
        let hpData = this.core.save.health;
        let hpStorage = this.db.health;
        let needUpdate = false;

        if (hpData.containers < hpStorage.containers) {
            this.core.save.health.containers = hpStorage.containers;
            this.core.save.health.hearts = this.db.health.containers;
        } else if (hpData.containers > hpStorage.containers) {
            hpStorage.containers = hpData.containers;
            needUpdate = true;
        }

        if (hpData.double_defense < hpStorage.double_defense) {
            this.core.save.health.double_defense = hpStorage.double_defense;
            this.core.save.health.hearts = this.db.health.containers;
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
        this.core.save.health.hearts = hpStorage.containers;

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
        let pData = new Net.SyncNumbered(
            this.ModLoader.clientLobby,
            'SyncMagic',
            this.db.magic.bar,
            false
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_map(bufData: Buffer, bufStorage: Buffer) {
        // Initializers
        let visible = this.core.save.map.visible;
        let visited = this.core.save.map.visited;
        let i: number;
        let count: number;
        let needUpdate = false;

        bufData = this.core.save.map.mini;
        bufStorage = this.db.map.mini;
        count = bufData.byteLength;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            needUpdate = true;
        }

        if (this.db.map.visible !== visible) {
            this.db.map.visible |= visible;
            needUpdate = true;
        }

        if (this.db.map.visited !== visited) {
            this.db.map.visited |= visited;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.map.mini = bufData;
        this.core.save.map.mini = this.db.map.mini;
        this.core.save.map.visible = this.db.map.visible;
        this.core.save.map.visited = this.db.map.visited;

        // Send changes to server
        let pData = new Net.SyncMap(this.ModLoader.clientLobby, this.db.map, false);
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

    handle_skill_level() {
        // Initializers
        let skill_level = this.core.save.skill_level;

        if (skill_level < this.db.skill_level) {
            this.core.save.skill_level = this.db.skill_level;
        } else if (skill_level > this.db.skill_level) {
            this.db.skill_level = skill_level;

            // Send changes to server
            let pData = new Net.SyncNumbered(
                this.ModLoader.clientLobby,
                'SyncSkillLevel',
                this.db.skill_level,
                false
            );
            this.ModLoader.clientSide.sendPacket(pData);
        }
    }

    handle_wallet() {
        // Initializers
        let wallet = this.core.save.wallet;

        if (wallet < this.db.wallet) {
            this.core.save.wallet = this.db.wallet;
        } else if (wallet > this.db.wallet) {
            this.db.wallet = wallet;

            // Send changes to server
            let pData = new Net.SyncNumbered(
                this.ModLoader.clientLobby,
                'SyncWallet',
                this.db.wallet,
                false
            );
            this.ModLoader.clientSide.sendPacket(pData);
        }
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
                this.db.c_buttons_need_update = true;
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

                if (val1 === -1 && val2 !== -1) {
                    bufData[i] = API.ItemType.BOTTLE_EMPTY;
                } else if (val2 === -1 && val1 !== -1) {
                    bufStorage[i] = API.ItemType.BOTTLE_EMPTY;
                    needUpdate = true;
                }
            }
        }

        // Process Changes
        if (!needUpdate) {
            // Set the temp storage variable to our
            // current bottles so we dont lose them
            if (this.db.timeless) {
                for (i = 0x12; i < 0x18; i++) {
                    bufStorage[i] = bufData[i];
                }
            }

            this.core.save.item_slots.array = bufStorage;
            return;
        }

        this.db.items = bufStorage;

        // Set the temp storage variable to our
        // current bottles so we dont lose them
        if (this.db.timeless) {
            for (i = 0x12; i < 0x18; i++) {
                bufStorage[i] = bufData[i];
            }
        }

        this.core.save.item_slots.array = bufStorage;

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

    handle_button_states(form: number) {
        let slot: number;

        // B Button Corrections
        if (form === API.FormType.HUMAN) {
            slot = this.core.runtime.b_human;

            if (
                slot === API.ItemType.NONE ||
                slot === API.ItemType.SWORD_KOKIRI ||
                slot === API.ItemType.SWORD_RAZOR ||
                slot === API.ItemType.SWORD_GILDED
            ) {
                let sword_owned = this.core.save.equip_slots.sword;

                if (sword_owned === API.SwordBmp.KOKIRI &&
                    slot !== API.ItemType.SWORD_KOKIRI)
                    this.core.runtime.b_human = API.ItemType.SWORD_KOKIRI;

                else if (sword_owned === API.SwordBmp.RAZOR &&
                    slot !== API.ItemType.SWORD_RAZOR)
                    this.core.runtime.b_human = API.ItemType.SWORD_RAZOR;

                else if (sword_owned === API.SwordBmp.GILDED &&
                    slot !== API.ItemType.SWORD_GILDED)
                    this.core.runtime.b_human = API.ItemType.SWORD_GILDED;
            }
        } else if (form === API.FormType.DEKU) {
            slot = this.core.runtime.b_deku;

            if (slot === 0xfd && this.db.magic.bar !== 0)
                this.core.runtime.b_deku = API.ItemType.DEKU_NUT;
        }

        if (this.db.c_buttons_need_update) {
            let left = this.core.runtime.c_left_equipped;
            let down = this.core.runtime.c_down_equipped;
            let right = this.core.runtime.c_right_equipped;

            if (left < 0x18) this.core.runtime.c_left = this.db.items[left];
            if (down < 0x18) this.core.runtime.c_down = this.db.items[down];
            if (right < 0x18) this.core.runtime.c_right = this.db.items[right];

            this.db.c_buttons_need_update = false;
        }
    }

    constructor() { }

    preinit(): void {
        this.pMgr = new Puppet.PuppetManager();
    }

    init(): void { }

    postinit(): void {
        // Is Client or Server check
        if (this.rom === undefined) return;

        let tools: Z64RomTools;
        let buf: Buffer;

        // Determine if randomizer
        buf = this.rom.slice(0x0001a4d0, 0x0001a4db);
        this.db.is_rando = buf.toString() === 'MajoraRando';

        // Set tunic color
        tools = new Z64RomTools(this.ModLoader, 0x1a500);
        buf = tools.decompressFileFromRom(this.rom, 654);
        this.core.player.tunic_color = buf.readInt32BE(0xb39c);

        // Inject puppet zobj
        {
            let zz = new zzstatic();
            this.ModLoader.payloadManager.registerPayloadType(new OverlayPayload('.ovl'));

            // Fierce Deity
            let zDeity = zz.doRepoint(fs.readFileSync(__dirname + '/Deity.zobj'), 0);
            this.ModLoader.utils.setTimeoutFrames(() => { this.ModLoader.emulator.rdramWriteBuffer(0x900000, zDeity) }, 100);

            // Goron
            let zGoron = zz.doRepoint(fs.readFileSync(__dirname + '/Goron.zobj'), 1);
            this.ModLoader.utils.setTimeoutFrames(() => { this.ModLoader.emulator.rdramWriteBuffer(0x910000, zGoron) }, 100);

            // Zora
            let zZora = zz.doRepoint(fs.readFileSync(__dirname + '/Zora.zobj'), 2);
            this.ModLoader.utils.setTimeoutFrames(() => { this.ModLoader.emulator.rdramWriteBuffer(0x920000, zZora) }, 100);

            // Deku
            let zDeku = zz.doRepoint(fs.readFileSync(__dirname + '/Deku.zobj'), 3);
            this.ModLoader.utils.setTimeoutFrames(() => { this.ModLoader.emulator.rdramWriteBuffer(0x930000, zDeku) }, 100);

            // Human
            let zHuman = zz.doRepoint(fs.readFileSync(__dirname + '/Human.zobj'), 4);
            this.ModLoader.utils.setTimeoutFrames(() => { this.ModLoader.emulator.rdramWriteBuffer(0x940000, zHuman) }, 100);

        }

        // Puppet Manager Inject
        this.pMgr.postinit(
            this.ModLoader.emulator,
            this.core,
            this.ModLoader.me,
            this.ModLoader
        );
        this.ModLoader.logger.info('Puppet manager activated.');
    }

    onTick(): void {
        // Make sure we dont process game when not playing
        if (!this.core.isPlaying()) {
            if (this.core.isTitleScreen() && this.db.has_game_data)
                this.reset_session();

            this.db.in_game = false;
            return;
        }

        // Initializers
        let bufStorage: Buffer;
        let bufData: Buffer;
        let form: number = this.core.player.current_form;
        let scene: number = this.core.runtime.get_current_scene() & 0x000000ff;
        let cutscene: number = this.core.runtime.cutscene_ptr;
        let timeCard: boolean = this.core.runtime.get_current_scene() === 0x804d;
        let zoning: boolean = this.core.runtime.is_entering_zone();
        let isSafe: boolean = !(zoning || timeCard ||
            (!this.db.is_rando && cutscene !== 0) ||
            scene === API.SceneType.VARIOUS_CUTSCENES);

        // Safety Checks
        if (zoning || timeCard) scene = -1;

        // Intro skip
        this.handle_intro_flag(scene, timeCard);

        // Day transition handler
        if (this.db.has_game_plyr && !this.db.in_game)
            this.db.clock_need_update = true;

        // General Setup/Handlers
        this.handle_reset_time(scene, cutscene);
        this.handle_scene_change(scene, form, timeCard);
        this.handle_puppets(scene, isSafe);

        // Need to finish resetting the cycle
        if (!this.db.timeless && this.db.time_reset) return;

        // Sync Specials
        this.handle_clock(scene, timeCard);

        // Sync Flags
        this.handle_cycle_flags(bufData!, bufStorage!);
        this.handle_event_flags(bufData!, bufStorage!);
        this.handle_game_flags(bufData!, bufStorage!);
        this.handle_owl_flags(bufData!, bufStorage!);
        this.handle_scene_data(bufData!, bufStorage!);

        // Sync Misc
        this.handle_bank();
        this.handle_dungeon();
        this.handle_health();
        this.handle_magic();
        this.handle_map(bufData!, bufStorage!);
        this.handle_quest_status();
        this.handle_skill_level();
        this.handle_wallet();

        // Sync Start Menu Items
        this.handle_equip_slots();
        this.handle_item_slots(bufData!, bufStorage!);
        this.handle_masks_slots(bufData!, bufStorage!);

        // Post Sync Handlers
        this.handle_button_states(form);
    }

    @EventHandler(ModLoaderEvents.ON_ROM_PATCHED)
    onRomPatched(evt: any) {
        this.rom = evt.rom;
    }

    @EventHandler(EventsClient.ON_PAYLOAD_INJECTED)
    onPayload(evt: any) {
        if (evt.file !== 'link.ovl') return

        this.ModLoader.utils.setTimeoutFrames(() => {
            this.ModLoader.emulator.rdramWrite16(0x800000, evt.result);
            //console.log('Setting link puppet id to ' + evt.result + '.');
        }, 20);
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
    }

    @EventHandler(EventsClient.ON_LOBBY_JOIN)
    onClient_LobbyJoin(lobby: LobbyData): void {
        // Send our storage request to the server
        let pData = new Packet('RequestStorage', 'MmOnline', this.ModLoader.clientLobby, false);
        this.ModLoader.clientSide.sendPacket(pData);

        // Load config
        if (!fs.existsSync(this.configPath))
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));

        this.config = JSON.parse(fs.readFileSync(this.configPath).toString());

        // Send our config data
        pData = new Net.SyncConfig(
            this.ModLoader.clientLobby,
            this.config.timeless_mode,
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
        this.pMgr.reset();
        if (this.core.runtime === undefined || !this.core.isPlaying()) return;
        let pData = new Net.SyncLocation(
            this.ModLoader.clientLobby,
            this.ModLoader.me,
            this.curScene,
            this.core.player.current_form
        );
        this.ModLoader.clientSide.sendPacket(pData);
    }

    @EventHandler(EventsClient.ON_PLAYER_JOIN)
    onClient_PlayerJoin(nplayer: INetworkPlayer) {
        this.pMgr.registerPuppet(nplayer);
    }

    @EventHandler(EventsClient.ON_PLAYER_LEAVE)
    onClient_PlayerLeave(nplayer: INetworkPlayer) {
        this.pMgr.unregisterPuppet(nplayer);
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
            sDB.dungeon,
            sDB.map,
            sDB.skill_level,
            sDB.wallet,
            sDB.has_game_data,
            sDB.has_game_plyr
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

    @ServerNetworkHandler('SyncPlayerInGame')
    onServer_SyncPlayerInGame(packet: Packet): void {
        this.ModLoader.logger.info('[Server] Received: {Player Entered Game}');
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        sDB.has_game_plyr = true;
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

        // Pull game data
        sDB.cycle_flags = packet.cycle;
        sDB.event_flags = packet.events;
        Object.keys(sDB.scene_data).forEach((key: string) => {
            sDB.scene_data[key] = new Net.SceneData();
        });
        sDB.dungeon = new Net.DungeonData();

        // Reset time
        sDB.clock.current_day = 1;
        sDB.clock.elapsed = 1;
        sDB.clock.is_night = false;
        sDB.clock.speed = 0;
        sDB.clock.time = 16348;

        // Send packet
        let pData = new Net.SyncTimeReset(
            packet.lobby,
            sDB.cycle_flags,
            sDB.event_flags,
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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        if (data >= packet.value) return;
        sDB.intro_state = packet.value;

        let pData = new Net.SyncNumbered(packet.lobby, 'SyncIntroState', packet.value, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Intro State Flags}');
    }

    @ServerNetworkHandler('SyncSceneData')
    onServer_SyncSceneData(packet: Net.SyncSceneData) {
        this.ModLoader.logger.info('[Server] Received: {Scene Flags}');

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        if (count !== packet.value) needUpdate = true;

        if (!needUpdate) return;

        sDB.bank = packet.value;

        this.ModLoader.logger.info('[Server] Updated: {Bank Balance}');
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
        if (sDB.clock.current_day !== packet.clock.current_day) needUpdate = true;
        if (sDB.clock.elapsed !== packet.clock.elapsed) needUpdate = true;
        if (sDB.clock.is_night !== packet.clock.is_night) needUpdate = true;
        if (sDB.clock.speed !== packet.clock.speed) needUpdate = true;
        if (timeData !== timeStorage) needUpdate = true;

        if (needUpdate) {
            sDB.clock = packet.clock;

            // Ensure has_game_data check completed        
            sDB.has_game_data = true;

            // Send changes to clients
            let pData = new Net.SyncClock(packet.lobby, sDB.clock, true);
            this.ModLoader.serverSide.sendPacket(pData);

            this.ModLoader.logger.info('[Server] Updated: {Clock}');
        } else {
            // Player is out of date, refresh them
            let pData = new Net.SyncClock(packet.lobby, sDB.clock, false);
            this.ModLoader.serverSide.sendPacketToSpecificPlayer(pData, packet.player);
        }
    }

    @ServerNetworkHandler('SyncDungeon')
    onServer_SyncDungeon(packet: Net.SyncDungeon): void {
        this.ModLoader.logger.info('[Server] Received: {Dungeon}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let needUpdate = false;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        if (sDB.dungeon.fairies < packet.fairies) {
            sDB.dungeon.fairies = packet.fairies;
            needUpdate = true;
        }

        if (sDB.dungeon.items < packet.items) {
            sDB.dungeon.items = packet.items;
            needUpdate = true;
        }

        if (sDB.dungeon.keys !== packet.keys) {
            sDB.dungeon.keys = packet.keys;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        // Send changes to clients
        let pData = new Net.SyncDungeon(
            packet.lobby,
            sDB.dungeon.fairies,
            sDB.dungeon.items,
            sDB.dungeon.keys,
            true
        );
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Dungeon}');
    }

    @ServerNetworkHandler('SyncHealth')
    onServer_SyncHealth(packet: Net.SyncHealth): void {
        this.ModLoader.logger.info('[Server] Received: {Health}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let health: Net.HealthData = sDB.health;
        let needUpdate = false;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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
    onServer_SyncMagic(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Server] Received: {Magic}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let magic: Net.MagicData = sDB.magic;
        let needUpdate = false;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        if (magic.bar < packet.value) {
            magic.bar = packet.value;
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.magic = magic;

        // Send changes to clients
        let pData = new Net.SyncNumbered(packet.lobby, 'SyncMagic', magic.bar, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Magic}');
    }

    @ServerNetworkHandler('SyncMap')
    onServer_SyncMap(packet: Net.SyncMap): void {
        this.ModLoader.logger.info('[Server] Received: {Map}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let map: Net.MapData = sDB.map;
        let i: number;
        let count = map.mini.byteLength;
        let needUpdate = false;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (map.mini[i] === packet.map.mini[i]) continue;
            map.mini[i] |= packet.map.mini[i];
            needUpdate = true;
        }

        if (map.visible !== packet.map.visible) {
            map.visible |= packet.map.visible;
            needUpdate = true;
        }

        if (map.visited !== packet.map.visited) {
            map.visited |= packet.map.visited;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        sDB.map = map;

        // Send changes to clients
        let pData = new Net.SyncMap(packet.lobby, map, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: {Map}');
    }

    @ServerNetworkHandler('SyncQuestStatus')
    onServer_SyncQuestStatus(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Server] Received: {Quest Status}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let status: number = sDB.quest_status;
        let needUpdate = false;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

    @ServerNetworkHandler('SyncSkillLevel')
    onServer_SyncSkillLevel(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Server] Received: {Skill Level}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        if (sDB.skill_level < packet.value) {
            sDB.skill_level = packet.value;

            // Send changes to clients
            let pData = new Net.SyncNumbered(packet.lobby, 'SyncSkillLevel', sDB.skill_level, true);
            this.ModLoader.serverSide.sendPacket(pData);

            this.ModLoader.logger.info('[Server] Updated: {Skill Level}');
        }
    }

    @ServerNetworkHandler('SyncWallet')
    onServer_SyncWallet(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Server] Received: {Wallet}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

        if (sDB.wallet < packet.value) {
            sDB.wallet = packet.value;

            // Send changes to clients
            let pData = new Net.SyncNumbered(packet.lobby, 'SyncWallet', sDB.wallet, true);
            this.ModLoader.serverSide.sendPacket(pData);

            this.ModLoader.logger.info('[Server] Updated: {Wallet}');
        }
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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

        // Ensure has_game_data check completed        
        sDB.has_game_data = true;

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

    // Puppet Tracking

    @ServerNetworkHandler('SyncLocation')
    onServer_SyncLocation(packet: Net.SyncLocation) {
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let pMsg = 'Player[' + packet.player.nickname + ']';
        let sMsg = 'Scene[' + this.scene_name(packet.scene) + ']';
        sDB.players[packet.player.uuid] = packet.scene;

        if (packet.scene !== -1) {
            this.ModLoader.logger.info('[Server] Received: {Player Scene}');
            this.ModLoader.logger.info('[Server] Updated: ' + pMsg + ' to ' + sMsg);
        }

        this.check_db_instance(sDB, packet.scene);

        // Determine if safe to receive time data from player again
        if (packet.scene === API.SceneType.VARIOUS_CUTSCENES)
            sDB.player_resetting[packet.player.uuid] = false;
    }

    @ServerNetworkHandler('SyncPuppet')
    onServer_SyncPuppet(packet: Net.SyncPuppet) {
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        if (!sDB.hasOwnProperty("players") || sDB.players === null) return;
        Object.keys(sDB.players).forEach((key: string) => {
            if (sDB.players[key] !== sDB.players[packet.player.uuid]) {
                return;
            }

            if (!sDB.playerInstances.hasOwnProperty(key)) return;
            if (sDB.playerInstances[key].uuid === packet.player.uuid) {
                return;
            }

            this.ModLoader.serverSide.sendPacketToSpecificPlayer(
                packet,
                sDB.playerInstances[key]
            );
        });
    }

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
        this.db.health = packet.health;
        this.db.magic = packet.magic;
        this.db.equips = packet.equips;
        this.db.items = packet.items;
        this.db.masks = packet.masks;
        this.db.clock = packet.clock;
        this.db.dungeon = packet.dungeon;
        this.db.map = packet.map;
        this.db.skill_level = packet.skill_level;
        this.db.wallet = packet.wallet;
        this.db.has_game_data = packet.has_game_data;
        this.db.has_game_plyr = packet.has_game_plyr;
    }

    @NetworkHandler('SyncConfig')
    onClient_SyncConfig(packet: Net.SyncConfig) {
        this.ModLoader.logger.info('[Client] Updated: {Lobby Config}');

        this.db.timeless = packet.timeless;
    }

    @NetworkHandler('SyncPlayerInGame')
    onClient_SyncPlayerInGame(packet: Net.SyncStorage): void {
        var insert = 'Player[' + packet.player.nickname + '] Entered Game';
        this.ModLoader.logger.info('[Client] Received: {' + insert + '}');
        this.db.has_game_plyr = true;
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
        this.db.dungeon = new Net.DungeonData();

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
            this.db.clock.current_day = 1;
            this.db.clock.elapsed = 1;
            this.db.clock.is_night = false;
            this.db.clock.speed = 0;
            this.db.clock.time = 16384;
            this.db.clock_need_update = true;

            if (this.core.isPlaying()) {
                // Set time pre-day so transition screen happens
                this.core.save.clock.current_day = 0;
                this.core.save.clock.elapsed = 0;
                this.core.save.clock.is_night = false;
                this.core.save.clock.speed = 0;
                this.core.save.clock.time = 16384;
                this.db.time_reset = true;

                // Reset map location
                this.core.runtime.goto_scene(0x0000D800);
            }
        }

        this.curScene = API.SceneType.VARIOUS_CUTSCENES;
        this.ModLoader.clientSide.sendPacket(
            new Net.SyncLocation(
                this.ModLoader.clientLobby,
                this.ModLoader.me,
                API.SceneType.VARIOUS_CUTSCENES,
                this.core.player.current_form
            )
        );
    }

    @NetworkHandler('SyncCycleFlags')
    onClient_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Cycle Flags}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        let data: number = this.db.intro_state;
        if (data >= packet.value) return;
        this.db.intro_state = packet.value;

        this.ModLoader.logger.info('[Client] Updated: {Intro State Flags}');
    }

    @NetworkHandler('SyncSceneData')
    onClient_SyncSceneData(packet: Net.SyncSceneData) {
        this.ModLoader.logger.info('[Client] Received: {Scene Flags}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        // Initializers
        let count: number = this.db.bank;
        let needUpdate = false;

        if (count !== packet.value) needUpdate = true;

        if (!needUpdate) return;

        this.db.bank = packet.value;
        this.db.bank_need_update = true;

        this.ModLoader.logger.info('[Client] Updated: {Bank Balance}');
    }

    @NetworkHandler('SyncClock')
    onClient_SyncClock(packet: Net.SyncClock): void {
        this.ModLoader.logger.info('[Client] Received: {Clock}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let timeData = Math.floor(this.db.clock.time / 0x1000);
        let timeStorage = Math.floor(packet.clock.time / 0x1000);
        let needUpdate: boolean = false;

        // Compare major changes
        if (this.db.clock.current_day !== packet.clock.current_day) needUpdate = true;
        if (this.db.clock.elapsed !== packet.clock.elapsed) needUpdate = true;
        if (this.db.clock.is_night !== packet.clock.is_night) needUpdate = true;
        if (this.db.clock.speed !== packet.clock.speed) needUpdate = true;
        if (timeData !== timeStorage) needUpdate = true;

        if (!needUpdate) return;

        // console.log('#################################')
        // console.log('CLOCK:   ')
        // console.log('CLOCK:   ' + this.db.clock.current_day)
        // console.log('CLOCK:   ' + this.db.clock.elapsed)
        // console.log('CLOCK:   ' + this.db.clock.is_night)
        // console.log('CLOCK:   ' + this.db.clock.speed)
        // console.log('CLOCK:   ' + this.db.clock.time)
        // console.log('CLOCK:   ')
        // console.log('#################################')

        this.db.clock = packet.clock;
        this.db.clock_need_update = true;

        this.ModLoader.logger.info('[Client] Updated: {Clock}');
    }

    @NetworkHandler('SyncDungeon')
    onClient_SyncDungeon(packet: Net.SyncDungeon): void {
        this.ModLoader.logger.info('[Client] Received: {Dungeon}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        // Time sync feature only
        if (this.db.timeless) return;

        // Initializers
        let needUpdate = false;

        if (this.db.dungeon.fairies < packet.fairies) {
            this.db.dungeon.fairies = packet.fairies;
            needUpdate = true;
        }

        if (this.db.dungeon.items < packet.items) {
            this.db.dungeon.items = packet.items;
            needUpdate = true;
        }

        if (this.db.dungeon.keys !== packet.keys) {
            this.db.dungeon.keys = packet.keys;
            this.db.keys_need_update = true;
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.ModLoader.logger.info('[Client] Updated: {Dungeon}');
    }

    @NetworkHandler('SyncHealth')
    onClient_SyncHealth(packet: Net.SyncHealth): void {
        this.ModLoader.logger.info('[Client] Received: {Health}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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
    onClient_SyncMagic(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Client] Received: {Magic}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        // Initializers
        let magic: Net.MagicData = this.db.magic;
        let needUpdate = false;

        if (magic.bar < packet.value) {
            magic.bar = packet.value;
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.magic = magic;

        this.ModLoader.logger.info('[Client] Updated: {Magic}');
    }

    @NetworkHandler('SyncMap')
    onClient_SyncMap(packet: Net.SyncMap): void {
        this.ModLoader.logger.info('[Client] Received: {Map}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        // Initializers
        let map: Net.MapData = this.db.map;
        let i: number;
        let count = map.mini.byteLength;
        let needUpdate = false;

        // Detect Changes
        for (i = 0; i < count; i++) {
            if (map.mini[i] === packet.map.mini[i]) continue;
            map.mini[i] |= packet.map.mini[i];
            needUpdate = true;
        }

        if (map.visible !== packet.map.visible) {
            map.visible |= packet.map.visible;
            needUpdate = true;
        }

        if (map.visited !== packet.map.visited) {
            map.visited |= packet.map.visited;
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.map = map;

        this.ModLoader.logger.info('[Client] Updated: {Map}');
    }

    @NetworkHandler('SyncQuestStatus')
    onClient_SyncQuestStatus(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Client] Received: {Quest Status}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

    @NetworkHandler('SyncSkillLevel')
    onClient_SyncSkillLevel(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Client] Received: {Skill Level}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        if (this.db.skill_level < packet.value) {
            this.db.skill_level = packet.value;
            this.ModLoader.logger.info('[Client] Updated: {Skill Level}');
        }
    }

    @NetworkHandler('SyncWallet')
    onClient_SyncWallet(packet: Net.SyncNumbered): void {
        this.ModLoader.logger.info('[Client] Received: {Wallet}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

        if (this.db.wallet < packet.value) {
            this.db.wallet = packet.value;
            this.ModLoader.logger.info('[Client] Updated: {Wallet}');
        }
    }

    @NetworkHandler('SyncEquipSlots')
    onClient_SyncEquipSlots(packet: Net.SyncEquipSlots): void {
        this.ModLoader.logger.info('[Client] Received: {Equip Slots}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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
                this.db.bottles_need_update = true;
                needUpdate = true;
            }
            if (data[0x13] === 255 && packet.value[0x13] !== 255) {
                data[0x13] = API.ItemType.BOTTLE_EMPTY;
                this.db.bottles_need_update = true;
                needUpdate = true;
            }
            if (data[0x14] === 255 && packet.value[0x14] !== 255) {
                data[0x14] = API.ItemType.BOTTLE_EMPTY;
                this.db.bottles_need_update = true;
                needUpdate = true;
            }
            if (data[0x15] === 255 && packet.value[0x15] !== 255) {
                data[0x15] = API.ItemType.BOTTLE_EMPTY;
                this.db.bottles_need_update = true;
                needUpdate = true;
            }
            if (data[0x16] === 255 && packet.value[0x16] !== 255) {
                data[0x16] = API.ItemType.BOTTLE_EMPTY;
                this.db.bottles_need_update = true;
                needUpdate = true;
            }
            if (data[0x17] === 255 && packet.value[0x17] !== 255) {
                data[0x17] = API.ItemType.BOTTLE_EMPTY;
                this.db.bottles_need_update = true;
                needUpdate = true;
            }
        }

        if (!needUpdate) return;

        this.db.items = data;

        // May have gotten an item upgrade or bottle change
        this.db.c_buttons_need_update = true;

        this.ModLoader.logger.info('[Client] Updated: {Item Slots}');
    }

    @NetworkHandler('SyncMaskSlots')
    onClient_SyncMaskSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Client] Received: {Mask Slots}');

        // Ensure has_game_data check completed        
        this.db.has_game_data = true;

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

    // Puppet Tracking
    @NetworkHandler('Request_Scene')
    onClient_RequestScene(packet: Packet) {
        let scene: number = -1;
        let form: number = 4;

        // Only get in-game values
        if (!(this.core.runtime === undefined || !this.core.isPlaying)) {
            scene = this.curScene;
            form = this.core.player.current_form;
        }

        let pData = new Net.SyncLocation(packet.lobby, this.ModLoader.me, scene, form);
        this.ModLoader.clientSide.sendPacketToSpecificPlayer(pData, packet.player);
    }

    @NetworkHandler('SyncLocation')
    onClient_SyncLocation(packet: Net.SyncLocation) {
        let pMsg = 'Player[' + packet.player.nickname + ']';
        let sMsg = 'Scene[' + this.scene_name(packet.scene) + ']';
        this.pMgr.changePuppetScene(packet.player, packet.scene, packet.form);

        if (packet.scene !== API.SceneType.NONE) {
            this.ModLoader.logger.info('[Client] Received: {Player Scene}');
            this.ModLoader.logger.info('[Client] Updated: ' + pMsg + ' to ' + sMsg);
        }

        this.check_db_instance(this.db, packet.scene);
    }

    @NetworkHandler('SyncPuppet')
    onClient_SyncPuppet(packet: Net.SyncPuppet) {
        if (!this.core.isPlaying() ||
            this.core.runtime.is_paused() ||
            this.core.runtime.is_entering_zone()) return;
        this.pMgr.handlePuppet(packet);
    }
}

class find_init {
    constructor() { }

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
        //console.log('Trying to allocate actor...');
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
        //console.log(empty_slots.length + ' empty actor slots found.');
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
        //console.log('Assigning ' + path.parse(file).base + ' to slot ' + slot + '.');
        dest.writeUInt32BE(0x80000000 + addr, slot * 0x20 + overlay_start + 0x14);
        buf.writeUInt8(slot, offset + 0x1);
        buf.copy(dest, parseInt(meta.addr));
        return slot;
    }

}