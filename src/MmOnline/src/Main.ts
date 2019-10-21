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
    
    handle_cycle_flags(bufData: Buffer, bufStorage: Buffer) {
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

    handle_temp_flags(bufData: Buffer, bufStorage: Buffer) 
    {
        // Initializers
        let pData: Net.SyncBuffered;
        let i: number;
        let count = 0;
        let needUpdate = false;
        
        bufData = this.core.runtime.temp_flags.get_all();
        bufStorage = this.db.temp_flags;
        count = bufData.byteLength;

        // Detect Changes
        for (i = 0; i < count; i++) 
        {
            if (bufData[i] === bufStorage[i]) continue;
            bufData[i] |= bufStorage[i];
            this.core.runtime.temp_flags.set(i, bufData[i]);
            needUpdate = true;
        }

        // Process Changes
        if (!needUpdate) return;

        this.db.temp_flags = bufData;
        pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncTempFlags', bufData, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }
    
    handle_item_flags(bufData: Buffer, bufStorage: Buffer)  {
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

        if (!needUpdate) return;

        // Assign true data back to game and network
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

    constructor() { }

    preinit(): void { }

    init(): void { }

    postinit(): void { }

    onTick(): void {
        if (!this.core.isPlaying()) return;

        // Initializers
        let bufStorage: Buffer;
        let bufData: Buffer;

        // Sync Flags
        this.handle_game_flags(bufData!, bufStorage!);
        this.handle_cycle_flags(bufData!, bufStorage!);
        this.handle_temp_flags(bufData!, bufStorage!);
        
        // Sync Start Menu Items
        this.handle_item_flags(bufData!, bufStorage!);
        this.handle_masks_flags(bufData!, bufStorage!);


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
        let pData = new Packet('Request_Storage', 'BkOnline', this.ModLoader.clientLobby, false);
        this.ModLoader.clientSide.sendPacket(pData);
    }

    @EventHandler(EventsServer.ON_LOBBY_JOIN)
    onServer_LobbyJoin(evt: EventServerJoined) { }

    @EventHandler(EventsServer.ON_LOBBY_LEAVE)
    onServer_LobbyLeave(evt: EventServerLeft) {
        let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
    }

    @EventHandler(EventsClient.ON_SERVER_CONNECTION)
    onClient_ServerConnection(evt: any) { }

    @EventHandler(EventsClient.ON_PLAYER_JOIN)
    onClient_PlayerJoin(nplayer: INetworkPlayer) { }

    @EventHandler(EventsClient.ON_PLAYER_LEAVE)
    onClient_PlayerLeave(nplayer: INetworkPlayer) { }

    // #################################################
    // ##  Server Receive Packets
    // #################################################

    @ServerNetworkHandler('Request_Storage')
    onServer_RequestStorage(packet: Packet): void {
        this.ModLoader.logger.info('[Server] Sending: {Lobby Storage}');
        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let pData = new Net.SyncStorage(
            packet.lobby,
            sDB.game_flags,
            sDB.cycle_flags,
            sDB.temp_flags,
            sDB.items,
            sDB.masks

        );
        this.ModLoader.serverSide.sendPacketToSpecificPlayer(pData, packet.player);
    }

    @ServerNetworkHandler('SyncGameFlags')
    onServer_SyncGameFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Game Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.game_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

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

    @ServerNetworkHandler('SyncCycleFlags')
    onServer_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Cycle Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.cycle_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

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

    @ServerNetworkHandler('SyncTempFlags')
    onServer_SyncTempFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Server] Received: {Temp Flags}');

        let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;
        let data: Buffer = sDB.temp_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        sDB.temp_flags = data;

        let pData = new Net.SyncBuffered(packet.lobby, 'SyncTempFlags', data, true);
        this.ModLoader.serverSide.sendPacket(pData);

        this.ModLoader.logger.info('[Server] Updated: Temp Flags}');
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

    // #################################################
    // ##  Client Receive Packets
    // #################################################

    @NetworkHandler('SyncStorage')
    onClient_SyncStorage(packet: Net.SyncStorage): void {
        this.ModLoader.logger.info('[Client] Received: {Lobby Storage}');
        this.db.game_flags = packet.game_flags;
        this.db.cycle_flags = packet.cycle_flags;
        this.db.temp_flags = packet.temp_flags;
        this.db.items = packet.items;
        this.db.masks = packet.masks
    }

    @NetworkHandler('SyncGameFlags')
    onClient_SyncGameFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Game Flags}');

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
    
    @NetworkHandler('SyncCycleFlags')
    onClient_SyncCycleFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Cycle Flags}');

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

    @NetworkHandler('SyncTempFlags')
    onClient_SyncTempFlags(packet: Net.SyncBuffered) {
        this.ModLoader.logger.info('[Client] Received: {Temp Flags}');

        let data: Buffer = this.db.temp_flags;
        let count: number = data.byteLength;
        let i = 0;
        let needUpdate = false;

        for (i = 0; i < count; i++) {
            if (data[i] === packet.value[i]) continue;
            data[i] |= packet.value[i];
            needUpdate = true;
        }

        if (!needUpdate) return;

        this.db.temp_flags = data;

        this.ModLoader.logger.info('[Client] Updated: {Temp Flags}');
    }

    @NetworkHandler('SyncItemSlots')
    onClient_SyncItemSlots(packet: Net.SyncBuffered): void {
        this.ModLoader.logger.info('[Client] Received: {Item Slots}');

        // Initializers
        let data: Buffer = this.db.items;
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

        this.db.items = data;

        this.ModLoader.logger.info('[Client] Updated: {Item Slots}');
    }

    @NetworkHandler('SyncMaskSlots')
    onClient_SyncMaskSlots(packet: Net.SyncBuffered): void {

        this.ModLoader.logger.info('[Client] Received: {Mask Slots}');

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
}