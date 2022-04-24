//make sure todo list order is based on implementation priority
//TODO: haul midfield containers
//TODO: improve the spawn order and creep assignment
//TODO: cache pathing b/w spawns
//TODO: breakup code into separate files
//TODO: add enemy avoidance mechanisms to midfield workers 
//TODO: setup ranger patrols in midfield for skirmishing
//TODO: create healers to aid the attackers going to enemy spawn
//TODO: identify camps for creep squads to form.
//TODO: select creeps to be in squads
//TODO: implement healer logic into squads
//TODO: add rangers with basic kiting
//TODO: move squads in unison to spawn
//TODO: add retreat mechanisms
//TODO: allow squads to breakup to do skirmishing
//TODO: adjust behavior of squads against enemy clusters based on cluster's strength
//TODO: compare logistical/terrain advantage b/w squads and enemy clusters
//TODO: determine attack priority of individuals in enemy cluster.
//TODO: improve algorithm for identifying clusters of enemies. ideas: DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
//TODO: implement ramparts for use by squads

import { utils, prototypes, constants, visual, arenaInfo, createConstructionSite } from "game";
import { RoomPosition } from "game/prototypes";
import { findInRange } from "game/utils";

//its bounds will be represented by an axis aligned bounded box
interface UnitCluster {
	id: number,
	power: number,
	units: Array<UnitCluster|prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart>,
	min: prototypes.RoomPosition,
	max: prototypes.RoomPosition,
	mass: number,
}

type SQUAD_CAMPING = "camping";
const SQUAD_CAMPING: SQUAD_CAMPING = "camping";
type SQUAD_MOVING = "moving";
const SQUAD_MOVING: SQUAD_MOVING = "moving";

type SquadStatus =
	| SQUAD_CAMPING
	| SQUAD_MOVING;

//a full squad is composed of 3 attackers, 2 healers, 2 rangers
interface Squad {
	id: number,
	status: SquadStatus,
	units:  Array<prototypes.Creep>,
	target: RoomPosition|undefined,
}

//the squared value of the max tiles that an archer can reach
const MIN_CLUSTER_RANGE = 3;

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
	squad: Squad,
	newMidfieldWorkers: Array<prototypes.Creep>,
	midfieldWorkers: Array<prototypes.Creep>,
	desiredMidfieldWorkers: number,
	assignedConstructions: Map<prototypes.Id<prototypes.Creep>, prototypes.ConstructionSite>,
};

var state: State = {
	debug: true,
	containerToHauler: new Map(),
	haulerToContainer: new Map(),
	newhaulers: new Array(),
	haulers: new Array(),
	cpuViz: new visual.Visual(2, true),
	newAttackers: new Array(),
	attackers: new Array(),
	maxWallTimeMS: 0.0,
	maxWallTimeTick: 1,
	squad: {
		id: 1,
		status: SQUAD_MOVING,
		units: new Array(),
		target: undefined,
	},
	newMidfieldWorkers: new Array(),
	midfieldWorkers: new Array(),
	desiredMidfieldWorkers: 1,
	assignedConstructions: new Map(),
};

const SPAWN_SWAMP_BASIC_ARENA_WIDTH = 100;
const SPAWN_SWAMP_BASIC_ARENA_HEIGHT = 100;

//Math.ceil((totalParts - numMove) * 5 / numMove) would be swamp ticks per tile 
// numMove => relieved fatigue. (totalParts - numMove) * 5 => generated fatigue

//attacker cost -> 2*tough + 2*attack + 4*move = 380 energy
//healer cost -> 2*tough + 2*heal  + 4*move = 720 energy
//ranger cost -> 3*range + 3*move = 600 energy
//squad cost -> 3*attackers + 3*healers + 2*rangers -> 4340

//midfield worker -> 2*work + 2*carry + 4*move = 500

export function loop(): void {
	let mySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(spawn => spawn.my);
	if (mySpawns.length == 0) {
		console.log("wtf. spawns are dead");
		return;
	}
	let mySpawn = mySpawns[0];

	let enemySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(i => !i.my);
	let enemyRamparts = utils.getObjectsByPrototype(prototypes.StructureRampart).filter(i => !i.my);
	let enemyTowers = utils.getObjectsByPrototype(prototypes.StructureTower).filter(i => !i.my);
	let walls = utils.getObjectsByPrototype(prototypes.StructureWall);
	let enemyCreeps = utils.getObjectsByPrototype(prototypes.Creep).filter(creep => !creep.my);

	let creepCampOffset = 4;
	if (mySpawn.x > SPAWN_SWAMP_BASIC_ARENA_WIDTH/2) {
		creepCampOffset = -4;
	}

	state.squad.target = {
		x: mySpawn.x + creepCampOffset,
		y: mySpawn.y + creepCampOffset,
	};

	while (state.newhaulers.length > 0) {
		let creep = state.newhaulers.pop();
		if (creep !== undefined && creep.exists) {
			state.haulers.push(creep);
		}
	}

	while (state.newAttackers.length > 0) {
		let creep = state.newAttackers.pop();
		if (creep !== undefined && creep.exists) {
			state.attackers.push(creep);
		}
	}
	
	while (state.newMidfieldWorkers.length > 0) {
		let creep = state.newMidfieldWorkers.pop();
		if (creep !== undefined && creep.exists) {
			state.midfieldWorkers.push(creep);
		}
	}

	let starterContainers = utils.getObjectsByPrototype(prototypes.StructureContainer).filter(container => {
		let isCloseToSpawn = mySpawn.getRangeTo(container) < 5;
		let cap = container.store.getUsedCapacity(constants.RESOURCE_ENERGY);
		return isCloseToSpawn && cap != undefined && cap > 200;
	});

	if (state.haulers.length < starterContainers.length) {
		let creep = mySpawn.spawnCreep([constants.CARRY, constants.MOVE]).object;
		if (creep !== undefined) {
			state.newhaulers.push(creep);
		}
	} else if (state.midfieldWorkers.length < state.desiredMidfieldWorkers) {
		let creep = mySpawn.spawnCreep([constants.WORK, constants.WORK, constants.CARRY, constants.CARRY, constants.MOVE, constants.MOVE, constants.MOVE, constants.MOVE]).object;
		if (creep !== undefined) {
			state.newMidfieldWorkers.push(creep);
		}
	} else {
		let creep = mySpawn.spawnCreep([constants.MOVE, constants.ATTACK, constants.MOVE, constants.MOVE, constants.ATTACK, constants.ATTACK]).object;
		if (creep !== undefined) {
			state.newAttackers.push(creep);
		}
	}

	state.haulers.forEach((creep, idx) => {
		if (creep.exists === false) {
			state.haulers[idx] = state.haulers[state.haulers.length-1];
			state.haulers.pop();
			let container = state.haulerToContainer.get(creep.id);
			if (container !== undefined) {
				state.containerToHauler.delete(container.id);
			}
			state.haulerToContainer.delete(creep.id);
			return;
		}
		let container = state.haulerToContainer.get(creep.id);

		if (container === undefined || !container.exists || container.store.getUsedCapacity(constants.RESOURCE_ENERGY) == 0) {
			state.haulerToContainer.delete(creep.id);
			if (container !== undefined) {
				state.containerToHauler.delete(container.id);
			}

			container = starterContainers.find(container => {
				let assignedCreep = state.containerToHauler.get(container.id);
				if (assignedCreep === undefined || !assignedCreep.exists) {
					return container;
				}
			});
			if (container === undefined) {
				return;
			}
			state.containerToHauler.set(container.id, <prototypes.Creep>creep);
			state.haulerToContainer.set(creep.id, container);
			state.assignedConstructions.delete(creep.id);
		}

		if (container === undefined) {
			if (state.debug) {
				let style: TextStyle = {
					font: 0.7,
					color: "#ff0000",
				}
				new visual.Visual(1, false).text("Ih" + creep.id, creep, style);
			}
			return;
		} 
		if (state.debug) {
			let style: TextStyle = {
				font: 0.7,
				color: "#800080",
			}
			new visual.Visual(1, false).text("h" + creep.id, container, style);
			new visual.Visual(1, false).text("h" + creep.id, creep, style);
		}

		if(creep.id == undefined) {
			return;
		}

		let availCap =  creep.store.getFreeCapacity(constants.RESOURCE_ENERGY)
		if (availCap === null) {
			console.log("creep", creep.id, "has null free capacity");
			return;
		}

		if (availCap > 0) {
			let status = creep.withdraw(container, constants.RESOURCE_ENERGY)
			if (status === undefined) {
				console.log(creep.id, "got undefined withdraw status from container",container.id);
				return;
			}
			if (status === constants.ERR_NOT_IN_RANGE) {
				creep.moveTo(container);
			}
		} else {
			let status = creep.transfer(mySpawn, constants.RESOURCE_ENERGY)
			if (status === undefined) {
				console.log(creep.id, "got undefined transfer status to spawn",container.id);
				return;
			}
			if (status === constants.ERR_NOT_IN_RANGE) {
				creep.moveTo(mySpawn);
			}
		}
	});

	let midfieldContainers = utils.getObjectsByPrototype(prototypes.StructureContainer).filter(i => (i.x > 18 && i.x < 82 && i.y > 20 && i.y < 80));
	let resources = utils.getObjectsByPrototype(prototypes.Resource);
	let myExtensions = utils.getObjectsByPrototype(prototypes.StructureExtension).filter(i => i.my);
	state.midfieldWorkers.forEach((creep, idx) => {
		console.log("midfield worker top");
		if (creep.exists === false) {
			console.log("midefield worker", creep.id, "dead. bye bye");
			state.midfieldWorkers[idx] = state.midfieldWorkers[state.midfieldWorkers.length-1];
			state.midfieldWorkers.pop();
			let container = state.haulerToContainer.get(creep.id);
			if (container !== undefined) {
				state.containerToHauler.delete(container.id);
			}
			state.haulerToContainer.delete(creep.id);
			state.assignedConstructions.delete(creep.id);
			return;
		}
		let container = state.haulerToContainer.get(creep.id);

		let resource = creep.findClosestByRange(resources);
		let containerSpent = container === undefined || !container.exists || container.store.getUsedCapacity(constants.RESOURCE_ENERGY) == 0
		let energyOnTheGround = resource != undefined && resource.x == creep.x && resource.y == creep.y && resource.resourceType == constants.RESOURCE_ENERGY && resource.amount > 0;
		let availCap = creep.store.getFreeCapacity(constants.RESOURCE_ENERGY);
		let usedCap = creep.store.getUsedCapacity(constants.RESOURCE_ENERGY);
		let nearbyExtensions = creep.findInRange(myExtensions, 1).filter(i => i.store.getFreeCapacity(constants.RESOURCE_ENERGY));

		let availableEnergy: number = 0;
		if (resource != undefined && energyOnTheGround) {
			availableEnergy = resource.amount;
		}
		if (usedCap != undefined) {
			availableEnergy += usedCap;
		}

		let containerSpentButStillHaveEnergy = containerSpent && availableEnergy >= 10;

		if (availCap === 0 && nearbyExtensions.length > 0) {
			nearbyExtensions.forEach(i => {
				creep.transfer(i, constants.RESOURCE_ENERGY);
			});
		}
		//check if able to build extensions
		else if (containerSpentButStillHaveEnergy) {
			if (usedCap != undefined && usedCap >= 10) {
				console.log("building extensions")
				let construction = state.assignedConstructions.get(creep.id);
				if (construction === undefined || !construction.exists) {
					construction = undefined
				}
				for(let x = -1; construction === undefined && x <= 1; x++) {
					for(let y = -1; y <= 1; y++) {
						if (x == 0 && y == 0) {
							continue;
						}
						let res = utils.createConstructionSite({x: creep.x +x, y: creep.y + y}, prototypes.StructureExtension);
						console.log(res);
						if (res.object !== undefined) {
							construction = res.object;
							state.assignedConstructions.set(creep.id, res.object);
							break;
						}
					}
				}
				if(construction !== undefined) {
					let status = creep.build(construction);
					if (status === constants.ERR_NOT_IN_RANGE) {
						state.assignedConstructions.delete(creep.id);
					}
				} else {
					nearbyExtensions.forEach(i => {
						creep.transfer(i, constants.RESOURCE_ENERGY);
					});
					creep.drop(constants.RESOURCE_ENERGY);
				}
			} else if (energyOnTheGround && resource != undefined) {
				console.log("picking up energy");
				creep.pickup(resource);
			}
		}  
		//start dropping
		else if (availCap === 0) {
			console.log("dropping energy");
			creep.drop(constants.RESOURCE_ENERGY);
		}
		//look for a new container
		else if (containerSpent) {
			console.log("looking for container", midfieldContainers.length, " midfield containers for the pickings");
			if (container !== undefined) {
				state.haulerToContainer.delete(creep.id);
				state.containerToHauler.delete(container.id);
			}

			let bestContainer: prototypes.StructureContainer|undefined;
			let bestDist: number;
			midfieldContainers.forEach(container => {
				let assignedCreep = state.containerToHauler.get(container.id);
				if (assignedCreep !== undefined && assignedCreep.exists) {
					return;
				}
				let dist = creep.getRangeTo(container)
				if (bestContainer !== undefined && dist < bestDist) {
					return;
				}

				if (container.findInRange(enemyCreeps, 5).length > 0) {
					return;
				}

				let ticksToDecay: number = 1000;
				if (creep.ticksToDecay != undefined) {
					ticksToDecay = creep.ticksToDecay;
				}

				bestDist = dist / ticksToDecay;
				bestContainer = container;
			});
			if (bestContainer === undefined) {
				return;
			}
			state.containerToHauler.set(bestContainer.id, <prototypes.Creep>creep);
			state.haulerToContainer.set(creep.id, bestContainer);
		}

		if (container === undefined || !container.exists) {
			if (state.debug) {
				let style: TextStyle = {
					font: 0.7,
					color: "#ff0000",
				}
				new visual.Visual(1, false).text("Ih" + creep.id, creep, style);
			}
			return;
		}

		if (state.debug) {
			let style: TextStyle = {
				font: 0.7,
				color: "#800080",
			}
			new visual.Visual(1, false).text("h" + creep.id, container, style);
			new visual.Visual(1, false).text("h" + creep.id, creep, style);
		}

		if(creep.id == undefined) {
			return;
		}

		if (availCap != undefined && availCap > 0) {
			let status = creep.withdraw(container, constants.RESOURCE_ENERGY)
			if (status === undefined) {
				console.log(creep.id, "got undefined withdraw status from container",container.id);
				return;
			}
			if (status === constants.ERR_NOT_IN_RANGE) {
				creep.moveTo(container);
			}
		}
	});

	//clustering enemies
	let enemyClusters = new Array<UnitCluster>();
	let enemies = new Array<prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart|prototypes.StructureSpawn>(...enemySpawns, ...enemyCreeps, ...enemyRamparts, ...enemyTowers,);
	let enemyLabelViz = new visual.Visual(2, false);
	enemies.forEach(e => {
		if (state.debug) {
			let style: TextStyle = {
				font: 0.7,
				color: "#0000ff",
			}
			enemyLabelViz.text("e" + e.id, e, style);
		}
		let unitPower = 0;
		let mass = 1;
		if (e instanceof prototypes.Creep) {
			let rangePartCnt = 0;
			let attackPartCnt = 0;
			let healPartCnt = 0;
			let movePartCnt = 0;
			e.body.forEach(p => {
				switch (p.type) {
					case constants.ATTACK:
						attackPartCnt++;
					break;
					case constants.RANGED_ATTACK:
						rangePartCnt++;
						mass += 1;
					break;
					case constants.HEAL:
						healPartCnt++;
						mass += 1;
					break;
					case constants.MOVE:
						mass += 1;
					break;
				};
			});
			unitPower = 3*attackPartCnt + rangePartCnt * movePartCnt + healPartCnt * movePartCnt;
		} else if (e instanceof prototypes.StructureRampart) {
			unitPower = 20;
		} else if (e instanceof prototypes.StructureTower) {
			unitPower = 20;
			mass = 4;
		} else if (e instanceof prototypes.StructureSpawn) {
			let cap = e.store.getCapacity(constants.RESOURCE_ENERGY);
			let usedCap = e.store.getUsedCapacity(constants.RESOURCE_ENERGY);
			if (cap != undefined && usedCap != undefined) {
				unitPower = 30*usedCap/cap;
			}
			mass = 2;
		}

		const MIN_UNIT_DENSITY = 0.8;

		let bestCluster: UnitCluster | undefined;
		let highestDensity = 0.0;
		enemyClusters.forEach(cluster => {
			if (e.x >= cluster.min.x-MIN_CLUSTER_RANGE && e.x <= cluster.max.x + MIN_CLUSTER_RANGE && e.y >= cluster.min.y-MIN_CLUSTER_RANGE && e.y <= cluster.max.y + MIN_CLUSTER_RANGE) {
				let newMax: prototypes.RoomPosition = {
					x: Math.max(e.x, cluster.max.x),
					y: Math.max(e.y, cluster.max.y),
				};
				let newMin: prototypes.RoomPosition = {
					x: Math.min(e.x, cluster.min.x),
					y: Math.min(e.y, cluster.min.y),
				};

				let newArea = (newMax.x - newMin.x + 1) * (newMax.y - newMin.y + 1);
				let newMass = cluster.mass + mass;

				let density  = newMass / newArea;
				if (density > MIN_UNIT_DENSITY && highestDensity < density) {
					bestCluster = cluster; 
				}
			}
		});

		if (bestCluster === undefined) {
			let newCluster: UnitCluster = {
				id: enemyClusters.length,
				min: {
					x: e.x,
					y: e.y,
				},
				max: {
					x: e.x,
					y: e.y,
				},
				power: unitPower,
				units: new Array(e),
				mass: mass,
			}
			enemyClusters.push(newCluster);
		} else {
			let newMax: prototypes.RoomPosition = {
				x: Math.max(e.x, bestCluster.max.x),
				y: Math.max(e.y, bestCluster.max.y),
			};
			let newMin: prototypes.RoomPosition = {
				x: Math.min(e.x, bestCluster.min.x),
				y: Math.min(e.y, bestCluster.min.y),
			};
			bestCluster.max = newMax;
			bestCluster.min = newMin;
			bestCluster.power += unitPower;
			bestCluster.mass += mass;
			bestCluster.units.push(e);
			return bestCluster;
		}
	});

	if (state.debug) {
		enemyClusters.forEach(cluster => {
			let topleft: prototypes.RoomPosition = {
				x: cluster.min.x-0.5,
				y: cluster.min.y-0.5,
			}
			let topleftpad: prototypes.RoomPosition = {
				x: cluster.min.x-1.5,
				y: cluster.min.y-1.5,
			}
			let style: PolyStyle = {
				fill: "#ff0000",
				lineStyle: "solid",
			}
			let padStyle: PolyStyle = {
				fill: "#ffffff",
				lineStyle: "solid",
				opacity: 0.2,
			}
			enemyLabelViz.rect(topleftpad, cluster.max.x - cluster.min.x+3, cluster.max.y - cluster.min.y+3, padStyle);
			enemyLabelViz.rect(topleft, cluster.max.x - cluster.min.x+1, cluster.max.y - cluster.min.y+1, style);

			let textStyle: TextStyle = {
				font: 0.7,
				color: "#ffffff",
				backgroundColor: "#80808080",
			}
			let text = "EC" + cluster.id + ": ";
			cluster.units.forEach(e => {
				text += e.id + ", ";
			});
			text +="\nPower: " + cluster.power;
			text += "\nArea: " + (cluster.max.x - cluster.min.x + 1) * (cluster.max.y - cluster.min.y + 1); 
			text += "\nMass: " + cluster.mass; 
			let centerTop: prototypes.RoomPosition = {
				x: cluster.min.x + (cluster.max.x - cluster.min.x) / 2,
				y: cluster.min.y-1,
			} 
			enemyLabelViz.text(text, centerTop, textStyle);
		});
	}

	//running logic for individual attack units
	state.attackers.forEach(creep => {
		let target: prototypes.Creep | prototypes.Structure | undefined;
		let e = creep.findClosestByRange(enemyCreeps);
		if (e != undefined && utils.getRange(creep, e) < 5 && e.hits > 0 && utils.getRange(e, enemySpawns[0]) > 0.5) {
			target = e;
		} else {
			let er = creep.findClosestByRange(enemyRamparts);
			if (er != undefined) {
				target = er;
			} else {
				target = enemySpawns[0];
			}
		}

		if (target === undefined) {
			return;
		}

		let s = moveToAndAttack(creep, target);
		if (s !== constants.OK && s !== undefined) {
			console.log("attack status on target", target.id, ":", s);
		}
	});

	if (state.debug) {
		let style: TextStyle = {
			font: 8.0,
			color: "#800080",
		}

		let wallTimeMS = utils.getCpuTime()/1_000_000;
		if (state.maxWallTimeMS < wallTimeMS) {
			state.maxWallTimeMS = wallTimeMS;
			state.maxWallTimeTick = utils.getTicks();
		}

		let pos1: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y,
		};
		let pos2: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y + 4.0,
		};
		let pos3: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y + 8.0,
		};
		let pos4: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y + 12.0,
		};

		state.cpuViz.clear();
		state.cpuViz.text("Tick Wall Time ms:" + wallTimeMS, pos1);
		state.cpuViz.text("Max Tick Wall Time (ms:" + state.maxWallTimeMS + ", tick: " + state.maxWallTimeTick + ")", pos2 );
		state.cpuViz.text("First Tick Alloc Time ms:" + arenaInfo.cpuTimeLimitFirstTick/1_000_000, pos3);
		state.cpuViz.text("Tick Alloc Time ms:" + arenaInfo.cpuTimeLimit/1_000_000, pos4);
	}
}

function moveToAndAttack(creep: prototypes.Creep, target: prototypes.Creep | prototypes.Structure): constants.CreepActionReturnCode | constants.CreepMoveReturnCode | constants.ERR_NO_PATH | constants.ERR_INVALID_TARGET | undefined {
	let s = creep.attack(target)
	if (s === constants.ERR_NOT_IN_RANGE) {
		return creep.moveTo(target);
	}
	return s;

}