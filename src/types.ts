import { prototypes, visual, constants } from "game";
import { CostMatrix } from "game/path-finder";

export interface Target extends prototypes.RoomPosition {
	id: string	
};

//combat pairs are solely attacker to medics.
export type CombatPair = {
	attacker: prototypes.Creep
	healer: prototypes.Creep
};

export type HAULER = 1;
export type WORKER = 2;
export type ATTACKER = 3;
export type HEALER = 4;

export const HAULER: HAULER = 1;
export const WORKER: WORKER = 2;
export const ATTACKER: ATTACKER = 3;
export const HEALER: HEALER = 4;

export type CreepRole = 
	HAULER |
	WORKER |
	ATTACKER |
	HEALER
;

export type CreepUnit = {
	role: CreepRole,
	c: prototypes.Creep,
	lastPosition: prototypes.RoomPosition,
}

export type UnitStats = {
	range: number,
	attackPower: number,
	healPower: number,
	moveSpeed: number,
	hits: number,
}

export type ResourceDeposit = 
	prototypes.StructureSpawn |
	prototypes.StructureExtension
;

export type State = {
	debug: boolean,
	containerToHauler: Map<prototypes.Id<prototypes.StructureContainer>, prototypes.Creep>,
	haulerToContainer: Map<prototypes.Id<prototypes.Creep>, prototypes.StructureContainer>,
	cpuViz: visual.Visual,
	maxWallTimeMS: number,
	maxWallTimeTick: number,
	desiredMidfieldWorkers: number,
	desiredHaulers: number,
	haulerBody: constants.BodyPartConstant[],
	assignedConstructions: Map<prototypes.Id<prototypes.Creep>, prototypes.ConstructionSite>,
	creepsTargets: Map<prototypes.Id<prototypes.Creep>, Target>,
	creepsPaths: Map<prototypes.Id<prototypes.Creep>, prototypes.RoomPosition[]>
	newCreepUnits: Array<CreepUnit>,
	myCreepUnits: Array<CreepUnit>,
	costMatrix: CostMatrix,
	fleeCostMatrix: CostMatrix,
};


//its bounds will be represented by an axis aligned bounded box
export interface UnitCluster {
	id: number,
	stats: UnitStats,
	units: Array<prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart>,
	min: prototypes.RoomPosition,
	max: prototypes.RoomPosition,
	centerPower: prototypes.RoomPosition,
}