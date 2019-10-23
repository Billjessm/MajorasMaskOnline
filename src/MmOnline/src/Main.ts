import {
    EventsClient,
    EventServerJoined,
    EventServerLeft,
    EventHandler,
    EventsServer,
} from 'modloader64_api/EventHandler';
import { IModLoaderAPI, IPlugin } from 'modloader64_api/IModLoaderAPI';
import {
    ILobbyStorage,
    INetworkPlayer,
    LobbyData,
    NetworkHandler,
    ServerNetworkHandler,
} from 'modloader64_api/NetworkHandler';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import * as API from 'modloader64_api/MM/Imports';
import * as Net from './network/Imports';

export class MmOnline implements IPlugin {
    ModLoader = {} as IModLoaderAPI;
    name = 'MmOnline';

    @InjectCore() core!: API.IMMCore;

    // Storage Variables
    db = new Net.DatabaseClient();

    protected curScene: number = -1;

    reset_session(flagsOnly: boolean) {
        if (!flagsOnly) {
            this.db.clock_init = false;
        }

        this.db.clock_need_update = true;
        this.db.cycle_need_update = true;
        this.db.event_need_update = true;
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

        this.ModLoader.clientSide.sendPacket(
            new Packet(
                'SyncTimeReset',
                'MmOnline',
                this.ModLoader.clientLobby,
                false
            )
        );
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
        for (i = 0; i < count; i++) {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            this.core.save.event_flags.set(i, bufData[i]);
            needUpdate = true;
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

    handle_scene_data(bufData: Buffer, bufStorage: Buffer) {
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

    handle_item_flags(bufData: Buffer, bufStorage: Buffer) {
        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let val1: number;
        let val2: number;
        let count: number;
        let needUpdate = false;

        bufData = this.core.save.item_slots.array;
        bufStorage = this.db.items;
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

        // Process Changes
        if (!needUpdate) return;

        this.core.save.item_slots.array = bufData;
        this.db.items = bufData;

        // Send changes to server
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncItemSlots', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    handle_masks_flags(bufData: Buffer, bufStorage: Buffer) {
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
            this.core.save.clock.current_day = this.db.clock.current_day;
            this.core.save.clock.elapsed = this.db.clock.elapsed;
            this.core.save.clock.is_night = this.db.clock.is_night;
            this.core.save.clock.speed = this.db.clock.speed;
            this.core.save.clock.time = this.db.clock.time;
            this.db.clock_need_update = false;
            return;
        }

        if (!this.db.clock_init) return;

        // Initializers
        let pData: Net.SyncClock;
        let timeData = Math.floor(this.core.save.clock.time / 0x1000);
        let timeStorage = Math.floor(this.db.clock.time / 0x1000);
        let needUpdate: boolean = false;

        // Compare major changes
        if (this.core.save.clock.current_day !==
            this.db.clock.current_day) needUpdate = true;

        if (this.core.save.clock.elapsed !==
            this.db.clock.elapsed) needUpdate = true;

        if (this.core.save.clock.is_night !==
            this.db.clock.is_night) needUpdate = true;

        if (this.core.save.clock.speed !==
            this.db.clock.speed) needUpdate = true;

        if (timeData !== timeStorage) needUpdate = true;

        // Process Changes
        if (!needUpdate) return;

        let clock = new Net.ClockData();
        clock.current_day = this.core.save.clock.current_day;
        clock.elapsed = this.core.save.clock.elapsed;
        clock.is_night = this.core.save.clock.is_night;
        clock.speed = this.core.save.clock.speed;
        clock.time = this.core.save.clock.time;
        clock.is_started = true;

        this.db.clock = clock;

        pData = new Net.SyncClock(this.ModLoader.clientLobby, clock);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    constructor() { }

    preinit(): void {
        //this.pMgr = new Puppet.PuppetManager();
    }

    init(): void { }

    postinit(): void {
        // Puppet Manager Inject
        // this.pMgr.postinit(
        //     this.ModLoader.emulator,
        //     this.core,
        //     this.ModLoader.me,
        //     this.ModLoader
        // );

        // this.ModLoader.logger.info('Puppet manager activated.');
    }

    onTick(): void {
        // Make sure we dont process game when not playing
        if (!this.core.isPlaying()) {
            if (this.core.isTitleScreen() &&
                this.db.game_active) this.reset_session(false);
            return;
        }

        // Initializers
        let bufStorage: Buffer;
        let bufData: Buffer;
        let scene: number = this.core.runtime.get_current_scene();

        // Day transition handler
        if (this.db.clock.is_started &&
            !this.db.clock_init) this.reset_session(true);

        // General Setup/Handlers
        this.handle_reset_time(scene);
        this.handle_scene_change(scene);
        // this.handle_puppets(scene);

        // Need to finish resetting the cycle
        if (this.db.time_reset) return;

        // Sync Flags
        this.handle_cycle_flags(bufData!, bufStorage!);
        this.handle_event_flags(bufData!, bufStorage!);
        this.handle_game_flags(bufData!, bufStorage!);
        this.handle_owl_flags(bufData!, bufStorage!);
        this.handle_scene_data(bufData!, bufStorage!);

        // Sync Start Menu Items
        this.handle_item_flags(bufData!, bufStorage!);
        this.handle_masks_flags(bufData!, bufStorage!);

        // Sync Specials
        this.handle_clock();
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
        // Can set configurable settings for a host of
        // lobby to set for a play session. EX: combination with
        // below On_Lobby_Join event.

        // lobby.data['MmOnline:data1_syncing'] = true;
        // lobby.data['MmOnline:data2_syncing'] = true;
    }

    @EventHandler(EventsClient.ON_LOBBY_JOIN)
    onClient_LobbyJoin(lobby: LobbyData): void {
        this.db = new Net.DatabaseClient();

        // Can configure LobbyData here -- Allow hostable settings
        // and lobby based triggers. EX: combination with above
        // Configure_Lobby event.

        // this.LobbyConfig.data1_syncing = lobby.data['MmOnline:data1_syncing'];
        // this.LobbyConfig.data2_syncing = lobby.data['MmOnline:data2_syncing'];
        // this.ModLoader.logger.info('OotOnline settings inherited from lobby.');

        // Send our storage request to the server
        let pData = new Packet('Request_Storage', 'MmOnline', this.ModLoader.clientLobby, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    @EventHandler(EventsServer.ON_LOBBY_JOIN)
    onServer_LobbyJoin(evt: EventServerJoined) {
        let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
        storage.players[evt.player.uuid] = -1;
        storage.playerInstances[evt.player.uuid] = evt.player;
    }

    @EventHandler(EventsServer.ON_LOBBY_LEAVE)
    onServer_LobbyLeave(evt: EventServerLeft) {
        let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
        delete storage.players[evt.player.uuid];
        delete storage.playerInstances[evt.player.uuid];
    }

    @EventHandler(EventsClient.ON_SERVER_CONNECTION)
    onClient_ServerConnection(evt: any) {
        //this.pMgr.reset();
        if (this.core.runtime === undefined || !this.core.isPlaying()) return;
        let pData = new Net.SyncLocation(this.ModLoader.clientLobby, this.curScene)
        this.ModLoader.clientSide.sendPacket(pData);
    }

    @EventHandler(EventsClient.ON_PLAYER_JOIN)
    onClient_PlayerJoin(nplayer: INetworkPlayer) {
        //this.pMgr.registerPuppet(nplayer);
    }

    @EventHandler(EventsClient.ON_PLAYER_LEAVE)
    onClient_PlayerLeave(nplayer: INetworkPlayer) {
        //this.pMgr.unregisterPuppet(nplayer);
    }

    // #################################################
    // ##  Server Receive Packets
    // #################################################

    @ServerNetworkHandler('Request_Storage')
    onServer_RequestStorage(packet: Packet): void {
        this.ModLoader.logger.info('[Server] Sending: {Lobby Storage}');
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let pData = new Net.SyncStorage(
            packet.lobby,
            sDB.cycle_flags,
            sDB.event_flags,
            sDB.game_flags,
            sDB.owl_flags,
            sDB.scene_data,
            sDB.items,
            sDB.masks,
            sDB.clock,
            sDB.game_active
        );
        this.ModLoader.serverSide.sendPacketToSpecificPlayer(pData, packet.player);
    }

    @ServerNetworkHandler('SyncTimeReset')
    onServer_SyncTimeReset(packet: Net.SyncTimeReset): void {
        this.ModLoader.logger.info('[Server] Invoked: {Time Reset}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Clear the cycle values
        {
            sDB.cycle_flags.fill(0);

            // Clear temp events
            sDB.event_flags[0] &= 0xfe;
            sDB.event_flags[4] = 0x00;
            sDB.event_flags[5] = 0x00;
            sDB.event_flags[6] = 0x00;
            sDB.event_flags[7] &= 0x80;
            sDB.event_flags[8] &= 20;
            sDB.event_flags[9] = 0x00;
            sDB.event_flags[10] &= 0x08;
            sDB.event_flags[11] = 0x00;
            sDB.event_flags[12] &= 0x10;
            sDB.event_flags[13] &= 0x40;
            sDB.event_flags[14] &= 0x80;
            sDB.event_flags[15] &= 0x20;
            sDB.event_flags[16] = 0x00;
            sDB.event_flags[17] = 0x00;
            sDB.event_flags[18] = 0x00;
            sDB.event_flags[19] = 0x00;
            sDB.event_flags[20] = 0x00;
            sDB.event_flags[21] = 0x00;
            sDB.event_flags[22] &= 0x82;
            sDB.event_flags[23] &= 0x82;
            sDB.event_flags[24] &= 0x82;
            sDB.event_flags[25] &= 0x01;
            sDB.event_flags[26] &= 0x40;
            sDB.event_flags[27] = 0x00;
            sDB.event_flags[28] = 0x00;
            sDB.event_flags[29] = 0x00;
            sDB.event_flags[30] &= 0xf0;
            sDB.event_flags[31] &= 0x27;
            sDB.event_flags[32] &= 0x07;
            sDB.event_flags[33] = 0x00;
            sDB.event_flags[34] = 0x00;
            sDB.event_flags[35] &= 0xbf;
            sDB.event_flags[36] = 0x00;
            sDB.event_flags[37] = 0x00;
            sDB.event_flags[38] &= 0x20;
            sDB.event_flags[39] &= 0x20;
            sDB.event_flags[40] = 0x00;
            sDB.event_flags[41] &= 0x08;
            sDB.event_flags[42] = 0x00;
            sDB.event_flags[43] = 0x00;
            sDB.event_flags[44] = 0x00;
            sDB.event_flags[45] = 0x00;
            sDB.event_flags[46] = 0x00;
            sDB.event_flags[47] = 0x00;
            sDB.event_flags[48] = 0x00;
            sDB.event_flags[49] = 0x00;
            sDB.event_flags[50] &= 0x06;
            sDB.event_flags[51] = 0x00;
            sDB.event_flags[52] = 0x00;
            sDB.event_flags[53] &= 0x42;
            sDB.event_flags[54] &= 0x40;
            sDB.event_flags[55] = 0x00;
            sDB.event_flags[56] &= 0x02;
            sDB.event_flags[57] &= 0x08;
            sDB.event_flags[58] = 0x00;
            sDB.event_flags[59] &= 0x3c;
            sDB.event_flags[60] &= 0x10;
            sDB.event_flags[61] = 0x00;
            sDB.event_flags[62] = 0x00;
            sDB.event_flags[63] &= 0x20;
            sDB.event_flags[64] = 0x00;
            sDB.event_flags[65] = 0x00;
            sDB.event_flags[73] &= 0x08;
            sDB.event_flags[74] = 0x00;
            sDB.event_flags[75] &= 0x80;
            sDB.event_flags[76] = 0x00;
            sDB.event_flags[77] &= 0x01;
            sDB.event_flags[78] = 0x00;
            sDB.event_flags[79] &= 0x80;
            sDB.event_flags[80] = 0x00;
            sDB.event_flags[81] &= 0x08;
            sDB.event_flags[82] &= 0x10;
            sDB.event_flags[83] = 0x00;
            sDB.event_flags[84] = 0x00;
            sDB.event_flags[85] = 0x00;
            sDB.event_flags[86] &= 0x80;
            sDB.event_flags[87] &= 0xfc;
            sDB.event_flags[88] = 0x00;
            sDB.event_flags[89] = 0x00;
            sDB.event_flags[90] &= 0x10;
            sDB.event_flags[91] = 0x00;
            sDB.event_flags[92] &= 0x01;
            sDB.event_flags[93] &= 0x0c;
            sDB.event_flags[94] = 0x00;
            sDB.event_flags[95] = 0x00;
            sDB.event_flags[96] = 0x00;
            sDB.event_flags[97] = 0x00;
            sDB.event_flags[98] = 0x00;
            sDB.event_flags[99] = 0x00;

            Object.keys(sDB.scene_data).forEach((key: string) => {
                sDB.scene_data[key] = new Net.SceneData();
            });
        }

        // Reset everyones clock
        sDB.clock.current_day = 1;
        sDB.clock.elapsed = 1;
        sDB.clock.is_night = false;
        sDB.clock.time = 0x4000;

        // Reset everyones cycle
        let pData = new Net.SyncTimeReset(
            packet.lobby,
            sDB.cycle_flags,
            sDB.event_flags,
            sDB.items,
            sDB.masks,
            true
        );

        this.ModLoader.serverSide.sendPacket(
            new Net.SyncClock(packet.lobby, sDB.clock)
        );
        this.ModLoader.serverSide.sendPacket(pData);
    }

    @ServerNetworkHandler('SyncCycleFlags')
    onServer_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Cycle Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
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

    @ServerNetworkHandler('SyncSceneData')
    onServer_SyncSceneData(packet: Net.SyncSceneData) {
        this.ModLoader.logger.info('[Server] Received: {Scene Data}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

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

    @ServerNetworkHandler('SyncItemSlots')
    onServer_SyncItemSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Server] Received: {Item Slots}');

        // Initializers
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.items;
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
        this.db.scene_data = packet.scene_data;
        this.db.items = packet.items;
        this.db.masks = packet.masks;
        this.db.clock = packet.clock;
        this.db.game_active = packet.game_active;
    }

    @NetworkHandler('SyncTimeReset')
    onClient_SyncTimeReset(packet: Net.SyncTimeReset): void {
        this.ModLoader.logger.info('[Client] Invoked: {Time Reset}');

        // Should not invoke this function if not in game yet!
        if (!this.core.isPlaying()) return;

        // Fix to game
        this.core.save.cycle_flags.set_all(packet.cycle_flags);

        // Initializers
        this.db.cycle_flags = packet.cycle_flags;
        this.db.event_flags = packet.event_flags;

        this.db.items = packet.items;
        this.db.masks = packet.masks;

        Object.keys(this.db.scene_data).forEach((key: string) => {
            this.db.scene_data[key] = new Net.SceneData();
        });

        this.core.save.cycle_flags.set_all(this.db.cycle_flags);
        this.core.save.event_flags.set_all(this.db.event_flags);

        this.core.save.item_slots.array = this.db.items;
        this.core.save.mask_slots.array = this.db.masks;

        this.core.runtime.scene_flags.set_all(Buffer.alloc(0x14));

        if (!this.db.time_reset) this.core.runtime.goto_scene(0x0000D800);
    }

    @NetworkHandler('SyncCycleFlags')
    onClient_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Cycle Flags}');

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        let data: Buffer = this.db.cycle_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

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

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        let data: Buffer = this.db.event_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

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

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        let data: Buffer = this.db.game_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

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

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        let data: Buffer = this.db.owl_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.owl_flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Owl Flags}');
    }

    @NetworkHandler('SyncSceneData')
    onClient_SyncSceneData(packet: Net.SyncSceneData) {
        this.ModLoader.logger.info('[Client] Received: {Scene Flags}');

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        // Ensure we have this scene data!
        this.check_db_instance(this.db, packet.scene);

        let data: Buffer = (this.db.scene_data[packet.scene] as Net.SceneData).flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.flags[i]) continue;
            data[i] |= packet.flags[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.scene_data[packet.scene].flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Scene Flags}');
    }

    @NetworkHandler('SyncItemSlots')
    onClient_SyncItemSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Client] Received: {Item Slots}');

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        // Initializers
        let data: Buffer = this.db.items;
        let count: number = data.byteLength;
        let val1 = 0;
        let val2 = 0;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

        for (i = 0; i < count; i++) {
            val1 = data[i] !== 255 ? data[i] : -1;
            val2 = packet.value[i] !== 255 ? packet.value[i] : -1;

            if (val1 < val2) {
                data[i] = packet.value[i];
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

        // Do not set new data until finished reset
        if (this.db.time_reset) return;

        // Initializers
        let data: Buffer = this.db.masks;
        let count: number = data.byteLength;
        let val1 = 0;
        let val2 = 0;
        let i = 0;
        let needUpdate = false;

        // Ensure game_active check completed        
        this.db.game_active = true;

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
        this.db.clock_need_update = true;

        // Ensure game_active check completed        
        this.db.game_active = true;

        this.ModLoader.logger.info('[Client] Updated: {Clock}');
    }

    // Puppet Tracking

    @NetworkHandler('Request_Scene')
    onClient_RequestScene(packet: Packet) {
        if (this.core.runtime === undefined || !this.core.isPlaying) return;
        let pData = new Net.SyncLocation(packet.lobby, this.curScene);
        this.ModLoader.clientSide.sendPacketToSpecificPlayer(pData, packet.player);
    }

    @NetworkHandler('SyncLocation')
    onClient_SyncLocation(packet: Net.SyncLocation) {
        let pMsg = 'Player[' + packet.player.nickname + ']';
        let sMsg = 'Scene[' + packet.scene + ']';
        //this.pMgr.changePuppetScene(packet.player, packet.scene);
        this.ModLoader.logger.info('[Client] Received: {Player Scene}');
        this.ModLoader.logger.info('[Client] Updated: ' + pMsg + ' to ' + sMsg);
        this.check_db_instance(this.db, packet.scene);
    }

    // @NetworkHandler('SyncPuppet')
    // onClient_SyncPuppet(packet: Net.SyncPuppet) {
    //     this.pMgr.handlePuppet(packet);
    // }
}