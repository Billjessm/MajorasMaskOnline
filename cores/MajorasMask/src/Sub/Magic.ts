import * as API from '../../API/Imports';

export class Magic extends API.BaseObj implements API.IMagic {
    private amount_addr = 0x1ef6a9; //Current magic amount	0x30 = half bar, 0x60 = full bar (byte)
    private bar_addr = 0x1ef6a8; // 0,1 or 2 depending on your upgrades (int8)
    private double_meter_addr = 0x1ef6b0; //Double Magic Flag
    private has_meter1_addr = 0x1ef6b0;
    private has_meter2_addr = 0x1ef6b1;
    private magic_addr = 0x1f35a0; //unknown use?
    private max_addr = 0x1f359e; //0x30 = normal, 0x60 = double
    private status_addr = 0x1f3598; //triggers various effects, like use magic, flash magic, restore magic

    get amount(): number {
        return this.emulator.rdramRead8(this.amount_addr);
    }
    set amount(val: number) {
        this.emulator.rdramWrite8(this.amount_addr, val);
    }

    get bar(): number {
        return this.emulator.rdramRead8(this.bar_addr);
    }
    set bar(val: number) {
        this.emulator.rdramWrite8(this.bar_addr, val);

        switch (val) {
            case 1:
                this.emulator.rdramWrite16(this.magic_addr, 0x30);
                this.emulator.rdramWrite16(this.max_addr, 0x30);
                this.emulator.rdramWrite8(this.has_meter1_addr, 0x01);
                this.emulator.rdramWrite8(this.has_meter2_addr, 0x00);
                break;
            case 2:
                this.emulator.rdramWrite16(this.magic_addr, 0x60);
                this.emulator.rdramWrite16(this.max_addr, 0x60);
                this.emulator.rdramWrite8(this.has_meter1_addr, 0x01);
                this.emulator.rdramWrite8(this.has_meter2_addr, 0x01);
                break;
            default:
                this.emulator.rdramWrite16(this.magic_addr, 0x00);
                this.emulator.rdramWrite16(this.max_addr, 0x00);
                this.emulator.rdramWrite8(this.has_meter1_addr, 0x00);
                this.emulator.rdramWrite8(this.has_meter2_addr, 0x00);
                break;
        }
    }
}
