'use strict'

const MetaRole = require('roles_meta')

class Factotum extends MetaRole {
  constructor () {
    super()
    this.defaultEnergy = 800
  }

  getPriority (creep) {
    return PRIORITIES_CREEP_FACTOTUM
  }

  getBuild (room, options) {
    this.setBuildDefaults(room, options)
    let build = [MOVE, CARRY, CARRY, CARRY, CARRY]
    return Creep.buildFromTemplate(build, options.energy)
  }

  manageCreep (creep) {
    if (creep.ticksToLive < 50) {
      return creep.recycle()
    }

    if (creep.memory.labs) {
      if (creep.memory.labs === 'fill') {
        this.fillFeeders(creep)
      } else {
        this.emptyLabs(creep)
      }
      return
    }

    if (_.sum(creep.carry) > 0) {
      if (creep.carry[RESOURCE_ENERGY]) {
        this.emptyEnergy(creep)
      } else {
        this.emptyResources(creep)
      }
      return
    }

    const storage = creep.room.storage
    const terminal = creep.room.terminal

    // empty link
    const storageLink = storage.getLink()
    if (storageLink && storageLink.energy) {
      if (creep.pos.isNearTo(storageLink)) {
        creep.withdraw(storageLink, RESOURCE_ENERGY)
      } else {
        creep.travelTo(storageLink)
      }
      return
    }

    if (terminal && terminal.store[RESOURCE_ENERGY] > TERMINAL_ENERGY) {
      const overflow = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY
      const transferAmount = overflow < creep.carryCapacity ? overflow : creep.carryCapacity
      creep.withdraw(terminal, RESOURCE_ENERGY, transferAmount)
      return
    }

    // pick up dropped resources and creep renewal energy
    const suicideBooth = creep.room.getSuicideBooth()
    if (suicideBooth) {
      const resources = suicideBooth.lookFor(LOOK_RESOURCES)
      if (resources.length > 0) {
        creep.pickup(resources[0])
      }
    }

    if (terminal && storage) {
      // Does terminal have something storage needs?
      const terminalResources = _.shuffle(Object.keys(terminal.store))
      for (const resource of terminalResources) {
        if (resource === RESOURCE_ENERGY) {
          continue
        }
        const need = storage.getResourceNeed(resource)
        if (need > 0) {
          const amount = Math.min(need, creep.carryCapacity - creep.carry, terminal.store[resource])
          creep.withdraw(terminal, resource, amount)
          return
        }
      }

      // Does storage have terminal overflow?
      const storageResources = _.shuffle(Object.keys(storage.store))
      for (const resource of storageResources) {
        if (resource === RESOURCE_ENERGY) {
          continue
        }
        const need = storage.getResourceNeed(resource)
        if (need < 0) {
          const amount = Math.min((-need), creep.carryCapacity - creep.carry, terminal.store[resource])
          creep.withdraw(storage, resource, amount)
          return
        }
      }
    }

    creep.memory.labs = 'fill'
  }

  fillFeeders (creep) {
    const reaction = creep.room.getActiveReaction()
    const feeders = creep.room.getFeederLabs()
    if (feeders.length < 2) {
      delete creep.memory.labs
      delete creep.memory.filling
      return
    }

    if (feeders[0].mineralAmount > 0 && feeders[0].mineralType !== reaction[0]) {
      creep.memory.labs = 'empty'
      return
    }
    if (feeders[1].mineralAmount > 0 && feeders[1].mineralType !== reaction[1]) {
      creep.memory.labs = 'empty'
      return
    }

    if (_.sum(creep.carry) <= 0) {
      if (feeders[0].mineralAmount / feeders[0].mineralCapacity >= 0.5) {
        if (feeders[1].mineralAmount / feeders[1].mineralCapacity >= 0.5) {
          creep.memory.labs = 'empty'
        }
      }
    }

    const carrying = Object.keys(creep.carry)
    if (carrying.length > 3) {
      creep.memory.labs = 'empty'
      return
    }

    const individualMax = creep.carryCapacity / 2
    let reactionPrimaryAvailable = creep.room.storage.store[reaction[0]]
    if (creep.carry[reaction[0]]) {
      reactionPrimaryAvailable += creep.carry[reaction[0]]
    }
    let reactionSecondaryAvailable = creep.room.storage.store[reaction[1]]
    if (creep.carry[reaction[1]]) {
      reactionSecondaryAvailable += creep.carry[reaction[1]]
    }

    const targetAmount = Math.min(individualMax, reactionPrimaryAvailable, reactionSecondaryAvailable)
    if (targetAmount <= 0 || creep.carry[carrying[0]] > targetAmount || creep.carry[carrying[1]] > targetAmount) {
      creep.memory.labs = 'empty'
      return
    }

    if (creep.memory.filling) {
      if (creep.carry[reaction[0]] && feeders[0].canFill()) {
        if (creep.pos.isNearTo(feeders[0])) {
          creep.transfer(feeders[0], reaction[0])
        } else {
          creep.travelTo(feeders[0])
        }
      } else if (creep.carry[reaction[1]] && feeders[1].canFill()) {
        if (creep.pos.isNearTo(feeders[1])) {
          creep.transfer(feeders[1], reaction[1])
        } else {
          creep.travelTo(feeders[1])
        }
      } else {
        delete creep.memory.filling
        creep.memory.labs = 'empty'
      }
    } else {
      if (!creep.pos.isNearTo(creep.room.storage)) {
        creep.travelTo(creep.room.storage)
        return
      }

      if (!creep.carry[reaction[0]] || creep.carry[reaction[0]] < targetAmount) {
        const amount = creep.carry[reaction[0]] ? targetAmount - creep.carry[reaction[0]] : targetAmount
        creep.withdraw(creep.room.storage, reaction[0], amount)
      } else if (!creep.carry[reaction[1]] || creep.carry[reaction[1]] < targetAmount) {
        const amount = creep.carry[reaction[1]] ? targetAmount - creep.carry[reaction[1]] : targetAmount
        creep.withdraw(creep.room.storage, reaction[1], amount)
      } else {
        creep.memory.filling = true
      }
    }
  }

  emptyLabs (creep) {
    if (creep.carryCapacity - _.sum(creep.carry) <= 0) {
      delete creep.memory.labs
      return
    }
    const lab = this.getLabToEmpty(creep)
    if (!lab) {
      delete creep.memory.labs
      return
    }
    if (creep.pos.isNearTo(lab)) {
      creep.withdraw(lab, lab.mineralType)
    } else {
      creep.travelTo(lab)
    }
  }

  getLabToEmpty (creep) {
    const feeders = creep.room.getFeederLabs()
    const reaction = creep.room.getActiveReaction()

    // If one feeder doesn't have the right mineral and the other is empty then empty the first.
    if (feeders[0].mineralAmount) {
      if (feeders[1].mineralAmount === 0 && feeders[0].mineralType !== reaction[0]) {
        return feeders[0]
      }
    }
    if (feeders[1].mineralAmount) {
      if (feeders[0].mineralAmount === 0 && feeders[1].mineralType !== reaction[1]) {
        return feeders[1]
      }
    }

    // If feeders can not produce a reaction start emptying them.
    // Once one is empty the above code will finish the other.
    if (feeders[0].mineralAmount > 0 && feeders[1].mineralAmount > 0) {
      if (!REACTIONS[feeders[0].mineralType][feeders[1].mineralType]) {
        return feeders[0]
      }
    }

    // Empty vats that don't have a boost that will work with the feeders, or that are filling up.
    const vats = creep.room.getVatLabs()
    let currentProduct = false
    if (feeders[0].mineralAmount > 0 && feeders[1].mineralAmount > 0) {
      currentProduct = REACTIONS[feeders[0].mineralType][feeders[1].mineralType]
    }
    const desiredProduct = REACTIONS[reaction[0]][reaction[1]]
    let target = false
    let amount = 150
    for (const vat of vats) {
      if (!vat.mineralType) {
        continue
      }
      if ((!currentProduct || vat.mineralType !== currentProduct) && vat.mineralType !== desiredProduct) {
        return vat
      }
      if (vat.mineralAmount > amount) {
        amount = vat.mineralAmount
        target = vat
      }
    }
    return target
  }

  emptyEnergy (creep) {
    // fill terminal with energy
    if (creep.room.terminal && creep.room.terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY) {
      if (creep.pos.isNearTo(creep.room.terminal)) {
        const need = TERMINAL_ENERGY - creep.room.terminal.store[RESOURCE_ENERGY]
        const amount = need > creep.carry[RESOURCE_ENERGY] ? creep.carry[RESOURCE_ENERGY] : need
        creep.transfer(creep.room.terminal, RESOURCE_ENERGY, amount)
      } else {
        creep.travelTo(creep.room.terminal)
      }
      return
    }

    if (creep.room.structures[STRUCTURE_NUKER] && creep.room.isEconomyCapable('FILL_NUKER')) {
      const nuker = creep.room.structures[STRUCTURE_NUKER][0]
      if (nuker.energy < nuker.energyCapacity) {
        this.dumpEnergyToStructure(creep, nuker)
        return
      }
    }

    if (creep.room.structures[STRUCTURE_POWER_SPAWN] && creep.room.isEconomyCapable('FILL_POWER_SPAWN')) {
      const powerspawn = creep.room.structures[STRUCTURE_POWER_SPAWN][0]
      if (powerspawn.energy < powerspawn.energyCapacity) {
        this.dumpEnergyToStructure(creep, powerspawn)
        return
      }
    }

    // fill storage with energy
    this.dumpEnergyToStructure(creep, creep.room.storage)
  }

  dumpEnergyToStructure (creep, structure) {
    if (creep.pos.isNearTo(structure)) {
      creep.transfer(structure, RESOURCE_ENERGY)
    } else {
      creep.travelTo(structure)
    }
  }

  emptyResources (creep) {
    // Must be near storage to empty creep.
    if (!creep.pos.isNearTo(creep.room.storage)) {
      creep.travelTo(creep.room.storage)
      return
    }

    const resources = _.filter(Object.keys(creep.carry), a => a !== RESOURCE_ENERGY)
    if (resources.length < 1) {
      return false
    }
    const resource = resources[0]

    // If there's no other option just put it all in storage.
    if (!creep.room.terminal) {
      creep.transfer(creep.room.storage, resource)
      return true
    }

    // Intermediate boosts should stay in room.
    const resourceType = Mineral.getResourceType(resource)
    if (resourceType === 'tier1' || resourceType === 'tier2') {
      creep.transfer(creep.room.storage, resource)
      return true
    }

    // Put needed resources into storage and excess into terminal.
    const currentNeed = creep.room.storage.getResourceNeed(resource)
    if (currentNeed > 0) {
      const amount = creep.carry[resource] < currentNeed ? creep.carry[resource] : currentNeed
      creep.transfer(creep.room.storage, resource, amount)
    } else {
      if (creep.pos.isNearTo(creep.room.terminal)) {
        creep.transfer(creep.room.terminal, resource)
      } else {
        creep.travelTo(creep.room.terminal)
      }
    }
    return true
  }
}

module.exports = Factotum
