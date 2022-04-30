import { prototypes, visual} from "game";

declare module "types" {
	type Target = {
		id: prototypes.Id<prototypes.GameObject>	
		x: number,
		y: number,
	};

	type CombatPair = {
		id: number
		attacker: prototypes.Id<prototypes.Creep>|undefined
		healer: prototypes.Id<prototypes.Creep>|undefined
	};

	type State = {
		debug: boolean,
		containerToHauler: Map<prototypes.Id<prototypes.StructureContainer>, prototypes.Creep>,
		haulerToContainer: Map<prototypes.Id<prototypes.Creep>, prototypes.StructureContainer>,
		newhaulers: Array<prototypes.Creep>,
		haulers: Array<prototypes.Creep>,
		newAttackers: Array<prototypes.Creep>,
		attackers: Array<prototypes.Creep>,
		cpuViz: visual.Visual,
		maxWallTimeMS: number,
		maxWallTimeTick: number,
		newMidfieldWorkers: Array<prototypes.Creep>,
		midfieldWorkers: Array<prototypes.Creep>,
		desiredMidfieldWorkers: number,
		assignedConstructions: Map<prototypes.Id<prototypes.Creep>, prototypes.ConstructionSite>,
		creepsTargets: Map<prototypes.Id<prototypes.Creep>, Target>,
		creepsPaths: Map<prototypes.Id<prototypes.Creep>, prototypes.RoomPosition[]>
		combatPairCounter: number,
		combatPairs: Array<CombatPair>,
		creepIdToCombatPair: Map<prototypes.Id<prototypes.Creep>, CombatPair>,
	};


	//its bounds will be represented by an axis aligned bounded box
	interface UnitCluster {
		id: number,
		power: number,
		units: Array<UnitCluster|prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart>,
		min: prototypes.RoomPosition,
		max: prototypes.RoomPosition,
		mass: number,
	}
}