function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function computeAutoRange(values, physMin, physMax, padRatio = 0.12) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return { min: physMin, max: physMax }
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    const delta = Math.max(1, Math.abs(min) * 0.05)
    min -= delta
    max += delta
  }
  const span = max - min
  min -= span * padRatio
  max += span * padRatio
  min = clamp(min, physMin, physMax)
  max = clamp(max, physMin, physMax)
  if (max - min < 1e-6) return { min: physMin, max: physMax }
  return { min, max }
}

Component({
  properties: {
    series: { type: Array, value: [] }, // [{ts, value}]
    field: { type: String, value: 'value' },
    width: { type: Number, value: 340 },
    height: { type: Number, value: 160 },
    physMin: { type: Number, value: 0 },
    physMax: { type: Number, value: 100 },
    // 外部指定 Y 轴范围（与 Vue 端一致：轴范围可基于“真实点”计算后传入）
    yMin: { type: Number, value: NaN },
    yMax: { type: Number, value: NaN },
    color: { type: String, value: '#38bdf8' },
    tickCount: { type: Number, value: 4 },
    // 是否使用自动缩放（基于 series 的真实值）
    autoScale: { type: Boolean, value: true },
  },

  data: {},

  lifetimes: {
    attached() {
      // 组件挂载后绘制一次
      this.draw()
    },
  },

  observers: {
    'series,field,width,height,physMin,physMax,yMin,yMax,color,tickCount,autoScale': function () {
      this.draw()
    },
  },

  methods: {
    async draw() {
      const { width, height } = this.data
      if (!width || !height) return

      // 获取 2d 上下文
      const query = this.createSelectorQuery()
      query.select('#c').fields({ node: true, size: true })
      query.exec((res) => {
        const canvas = res?.[0]?.node
        const size = res?.[0]
        if (!canvas || !size) return

        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2
        canvas.width = Math.floor(size.width * dpr)
        canvas.height = Math.floor(size.height * dpr)

        const ctx = canvas.getContext('2d')
        // 重置变换，避免在部分环境/重绘情况下 scale 叠加导致坐标漂移
        if (typeof ctx.setTransform === 'function') {
          ctx.setTransform(1, 0, 0, 1, 0, 0)
        }
        ctx.scale(dpr, dpr)

        this._drawWithCtx(ctx, size.width, size.height)
      })
    },

    _drawWithCtx(ctx, w, h) {
      const { series, field, physMin, physMax, yMin, yMax, color, tickCount, autoScale } = this.data

      ctx.clearRect(0, 0, w, h)

      const padL = 36
      const padR = 8
      const padT = 8
      const padB = 18
      const innerW = w - padL - padR
      const innerH = h - padT - padB

      // 取值（只拿非 0 的真实点会导致缺口；这里直接用传入 series 的值即可）
      const values = (series || [])
        .map((p) => (typeof p?.[field] === 'number' ? p[field] : null))
        .filter((v) => v !== null)

      const hasExternalRange = Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin
      const range = hasExternalRange
        ? { min: yMin, max: yMax }
        : autoScale
          ? computeAutoRange(values, physMin, physMax)
          : { min: physMin, max: physMax }
      const min = range.min
      const max = range.max
      const span = max - min || 1

      // 网格 + 刻度
      ctx.strokeStyle = 'rgba(148,163,184,0.22)'
      ctx.lineWidth = 1
      ctx.fillStyle = '#9ca3af'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'

      for (let i = 0; i <= tickCount; i++) {
        const ratio = i / tickCount
        const y = padT + ratio * innerH
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(w - padR, y)
        ctx.stroke()

        const v = max - ratio * span
        ctx.fillText(String(Math.round(v * 10) / 10), padL - 4, y)
      }

      // 折线
      const n = (series || []).length
      if (!n) return

      // 裁剪到绘图区，避免曲线/线宽溢出到边框外（尤其右侧末端）
      ctx.save()
      ctx.beginPath()
      ctx.rect(padL, padT, innerW, innerH)
      ctx.clip()

      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()

      for (let i = 0; i < n; i++) {
        const p = series[i]
        const raw = typeof p?.[field] === 'number' ? p[field] : 0
        const v = clamp(raw, min, max)
        const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
        const y = padT + (1 - (v - min) / span) * innerH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()
    },
  },
})

