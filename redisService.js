import { redisClient } from 'redisClient'

// Set a new key in redis
const set = (key, payload, isParsable) => {
  const value = isParsable ? JSON.stringify(payload) : payload
  return new Promise((resolve, reject) => {
    redisClient.set(key, value, function(err, response) {
      if (err) {
        return reject(err)
      }
      return resolve(response)
    })
  })
}

// Get a key from redis
const get = (key, isParsable) => {
  return new Promise((resolve, reject) => {
    redisClient.get(key, (err, result) => {
      if (err) {
        return reject(err)
      }
      const response = isParsable ? JSON.parse(result) : result
      return resolve(response)
    })
  })
}

// Get all keys from redis
const getAll = (keys, isParsable) => {
  return new Promise((resolve, reject) => {
    redisClient.mget(keys, (err, result) => {
      if (err) {
        return reject(err)
      }
      if (Array.isArray(keys) && Array.isArray(result)) {
        const response = keys.reduce(
          (prev, current, index) => ({
            ...prev,
            [current]: result[index]
          }),
          {}
        )
        return resolve(response)
      }
      const response = isParsable ? JSON.parse(result) : result
      return resolve(response)
    })
  })
}

// Get all keys matching pattern from redis
const getKeys = pattern => {
  return new Promise((resolve, reject) => {
    redisClient.keys(pattern, function(err, keys) {
      if (err) {
        return reject(err)
      }
      return resolve(keys)
    })
  })
}

// Delete a key from redis
const del = key => {
  return new Promise((resolve, reject) => {
    return redisClient.del(key, function(err, response) {
      if (err) {
        return reject(err)
      }
      return resolve(response)
    })
  })
}

// Delete all keys except those matching pattern from redis
const delAllKeysExcept = (pattern, key) => {
  getKeys(pattern).then(keys => {
    for (let i = 0; i < keys.length; i++) {
      const currentKey = keys[i]
      if (currentKey !== key) {
        del(currentKey)
      }
    }
  })
}

export default {
  set,
  get,
  getAll,
  getKeys,
  del,
  delAllKeysExcept
}
