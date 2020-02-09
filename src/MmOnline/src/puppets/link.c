#include <D:\OoT_Modding\Code\CAT\gcc\mips64\include\z64ovlMM/mm/u10.h>
#include <D:\OoT_Modding\Code\CAT\gcc\mips64\include\z64ovlMM/mm/helpers.h>
#include <C:\Users\pikpi\Desktop\ModLoader64\MajorasMaskOnline\src\MmOnline\src\puppets\defines_mm.h>
#include <C:\Users\pikpi\Desktop\ModLoader64\MajorasMaskOnline\src\MmOnline\src\puppets\defines_limbs.h>

// Actor Information

#define OBJ_ID_MM_CHILD 0x11

#define get_addr_offset(l, o) ((uint32_t *)((uint32_t)l + (uint32_t)o))

const z64_capsule_init_t Collision =
    {
        .cso_0x00 = 0x0A,
        .cso_0x01 = 0x00,
        .cso_0x01_02 = 0x00,
        .unk_0x12 = 0x09,
        .unk_0x12_2 = 0x20,
        .cso_0x05 = 0x01,
        .cso_0x08 = 0x00,
        .cso_0x0C = 0x00000000,
        .damage_type = 0x00,
        .damage_amount = 0x00,
        .cso_0x14 = 0xF7CFFFFF,
        .cso_0x18 = 0x00,
        .cso_0x19 = 0x00,
        .cso_0x1C = 0x00,
        .cso_0x1D = 0x00,
        .cso_0x1E = 0x01,
        .radius = 0x0007,
        .height = 0x003C,
        .cso_0x24 = 0x0000,
        .pos = {0, 0, 0}};


typedef struct
{
    uint8_t r;
    uint8_t g;
    uint8_t b;
    uint8_t a;
} z_color;

typedef struct
{
    uint8_t isZZ;
    uint32_t skeleton;
    uint16_t eye_index;
    uint32_t eye_texture;
    uint32_t base;
} zz_playas;

typedef struct
{
    z_color tunicColor;
    z_color bottleColor;
    zz_playas playasData;
    uint32_t age;
    uint8_t isHandClosed;
    uint8_t heldItemLeft;
    uint8_t heldItemRight;
    uint8_t backItem;
} z_link_puppet;

typedef struct
{
    z64_actor_t actor;
    uint8_t current_frame_data[0x86];
    z64_skelanime_t skelanime;
    z64_capsule_init_t cylinder;
    z_link_puppet puppetData;
    z64_capsule_t Collision;
} entity_t;

static uint32_t *getPlayerInstancePtr(z64_global_t *global)
{
    return get_addr_offset(global, 0x1CCC);
}

static void writeToExpansionPak(uint32_t var1, uint32_t offset)
{
    *((uint32_t *)(0x80600000 + offset)) = var1;
}

static uint32_t readFromExpansionPak(uint32_t offset)
{
    return *((uint32_t *)(0x80600000 + offset));
}

static int8_t copyPlayerAnimFrame(entity_t *en, z64_global_t *global)
{
    uint32_t *link = getPlayerInstancePtr(global);
    uint32_t offset = 0;

    memcpy(en->current_frame_data, get_addr_offset(0x80400500, 0x0), 0x86);

}

// get MM versions of these two functions.

static uint32_t getCodeAddress()
{
    uint32_t offset = 0;

    offset = 0x800A5AC0;
    return offset;
}

static uint32_t getSkeletonOffset()
{
    uint32_t offset = 0;

    offset = 0x1E244;

    return offset;
}

static void init(entity_t *en, z64_global_t *global)
{
    en->puppetData.age = MM_FORM_HUMAN;
    

	uint32_t* check1 = (uint32_t*)zh_seg2ram(0x06005000);
	uint32_t* check2 = (uint32_t*)zh_seg2ram(0x06005000 + 0x4);
	uint32_t* check3 = (uint32_t*)zh_seg2ram(0x06005000 + 0x8);

	uint32_t addr = getCodeAddress() + getSkeletonOffset();
	uint32_t* addr_p = (uint32_t*)addr;
	en->puppetData.playasData.skeleton = *addr_p;

    actor_collider_cylinder_init(global, &en->Collision, &en->actor, &Collision);

    	skelanime_init_mtx(
		global,
		&en->skelanime,
		en->puppetData.playasData.skeleton,
		0,
		0, 0, 0);

    actor_anime_change(&en->skelanime, 0, 0.0, 0.0, 0, 0, 1);
    actor_set_scale(&en->actor, 0.01f);
    copyPlayerAnimFrame(en, global);
    actor_collider_cylinder_init(global, &en->Collision, &en->actor, &Collision);

    en->actor.room_index = 0xFF;
    en->actor.flags = 0x08;

    en->puppetData.bottleColor.r = 0xFF;
    en->puppetData.bottleColor.g = 0xFF;
    en->puppetData.bottleColor.b = 0xFF;
    en->puppetData.bottleColor.a = 0xFF;
}

static void play(entity_t *en, z64_global_t *global)
{
    actor_collider_cylinder_update(&en->actor, &en->Collision);
    
    actor_collision_check_set_ot(global, AADDR(global, 0x18884), &en->Collision);

}

static int MMAnimate(z64_global_t* global, int limb_number, uint32_t* display_list, vec3f_t* translation, vec3s_t* rotation, entity_t* en)
{

	limb_number -= 1;
	if (limb_number == 0)
	{
		z64_rot_t* frame_translation = (z64_rot_t*)en->current_frame_data;
		translation->x += frame_translation->x;
		translation->y += (frame_translation->y * 0.66f);
		translation->z += frame_translation->z;
	}

	z64_rot_t* frame_limb_rotation = (z64_rot_t*)AADDR(&en->current_frame_data, 6 + (6 * limb_number));

	rotation->x += frame_limb_rotation->x;
	rotation->y += frame_limb_rotation->y;
	rotation->z += frame_limb_rotation->z;

	if (limb_number == LHAND) // left hand
	{

		if (en->puppetData.age == MM_FORM_HUMAN)
		{
			switch (en->puppetData.heldItemLeft)
			{

				/*
			0 = Nothing.
			1 = Kokiri Sword (Left Hand)
			2 = Razor Sword (Left Hand)
			3 = Gilded Sword (Left Hand)
			4 = Great Fairy Sword (Left Hand)
			5 = Hookshot (Right Hand)
			6 = Deku Stick (Left Hand)
			7 = Open Hand
			8 = Fist
			9 = Bottle Hand
			*/

			case 1:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_BLADE_KOKIRI_ZZ : HUMAN_DL_BLADE_KOKIRI;
				break;
			case 2:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_BLADE_RAZOR_ZZ : HUMAN_DL_BLADE_RAZOR;
				break;
			case 3:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_BLADE_GILDED_ZZ : HUMAN_DL_BLADE_GILDED;
				break;
			case 4:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_BLADE_GFSWORD_ZZ : HUMAN_DL_BLADE_GFSWORD;
				break;
			case 5:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_HOOKSHOT_ZZ : HUMAN_DL_HOOKSHOT;
				break;
			case 6:
				break;
			case 7:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_OPEN_HAND_ZZ : HUMAN_DL_OPEN_HAND;
				break;
			case 8:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_LFIST_ZZ : HUMAN_DL_LFIST;
				break;
			case 9:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_LHAND_BOTTLE_ZZ : HUMAN_DL_LHAND_BOTTLE;
				break;
			}
		}
	}

	else if (limb_number == RHAND)
	{
		if (en->puppetData.age == MM_FORM_HUMAN)
		{

			/*
				0 = Nothing
				1 = Bow
				2 = Hookshot
				3 = Ocarina
				4 = Hero's Shield
				5 = Mirror Shield
				6 = Mirror Shield Face
			*/

			switch (en->puppetData.heldItemRight)
			{
			case 1:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_BOW_ZZ : HUMAN_DL_BOW;
				break;
			case 2:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_HOOKSHOT_ZZ : HUMAN_DL_HOOKSHOT;
				break;
			case 3:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_RHAND_OCARINA_ZZ : HUMAN_DL_RHAND_OCARINA;
				break;
			case 4:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_SHIELD_HERO_ZZ : HUMAN_DL_SHIELD_HERO;
				break;
			case 5:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_SHIELD_MIRROR_ZZ : HUMAN_DL_SHIELD_MIRROR_ZZ;
				break;
			case 6:
				*display_list = en->puppetData.playasData.isZZ ? en->puppetData.playasData.base + HUMAN_DL_SHIELD_MIRROR_FACE_ZZ : HUMAN_DL_SHIELD_MIRROR_FACE_ZZ;
				break;
			}
		}
	}

	else if (limb_number == SHEATH)
	{
		if (en->puppetData.age == MM_FORM_HUMAN)
		{

			/*
				0 = Nothing
				1 = Kokiri Sheath
				2 = Razor Sheath
				3 = Gilded Sheath
				4 = Hero's Shield
				5 = Mirror Shield
				6 = Mirror Shield Face
			*/

			switch (en->puppetData.backItem)
			{
			case 1:
				*display_list = en->puppetData.playasData.isZZ ? HUMAN_DL_SHEATH_KOKIRI_ZZ : HUMAN_DL_SHEATH_KOKIRI;
				break;
			case 2:
				*display_list = en->puppetData.playasData.isZZ ? HUMAN_DL_SHEATH_RAZOR_ZZ : HUMAN_DL_SHEATH_RAZOR;
				break;
			case 3:
				*display_list = en->puppetData.playasData.isZZ ? HUMAN_DL_SHEATH_GILDED_ZZ : HUMAN_DL_SHEATH_GILDED;
				break;
			case 4:
				*display_list = en->puppetData.playasData.isZZ ? HUMAN_DL_SHIELD_HERO_ZZ : HUMAN_DL_SHIELD_HERO;
				break;
			case 5:
				*display_list = en->puppetData.playasData.isZZ ? HUMAN_DL_SHIELD_MIRROR_ZZ : HUMAN_DL_SHIELD_MIRROR;
				break;
			case 6:
				*display_list = en->puppetData.playasData.isZZ ? HUMAN_DL_SHIELD_MIRROR_FACE_ZZ : HUMAN_DL_SHIELD_MIRROR_FACE;
				break;
			}
		}
	}
	return 0;
}

#define GFX_POLY_OPA ZQDL(global, poly_opa)

static void otherCallback(z64_global_t *global, uint8_t limb, uint32_t dlist, vec3s_t *rotation, entity_t *en)
{

    return 1;
}

static void draw(entity_t *en, z64_global_t *global)
{
    copyPlayerAnimFrame(en, global);
    
    vec3f_t Scale[3] = {0.2, 0.2, 0.2};

    skelanime_draw_mtx(
        global,
        en->skelanime.limb_index,
        en->skelanime.unk5,
        en->skelanime.dlist_count,
        &MMAnimate, &otherCallback,
        &en->actor);
    
}

static void destroy(entity_t *en, z64_global_t *global)
{
    actor_collider_cylinder_free(global, &en->cylinder);
}

/* .data */
const z64_actor_init_t init_vars = {
    .number = 13, 
    .padding = 0x00, 
    .type = 0x4, 
    .room = 0xFF, 
    .flags = 0x00000001, 
    .object = OBJ_ID_MM_CHILD, 
    .instance_size = sizeof(entity_t), 
    .init = init, 
    .dest = destroy, 
    .main = play, 
    .draw = draw};
