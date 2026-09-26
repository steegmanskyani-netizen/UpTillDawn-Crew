const worker = {
  async fetch(request, env) {
    return env.UPSTREAM.fetch(request)
  },
}

export default worker
