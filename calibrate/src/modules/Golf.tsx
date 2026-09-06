import { useEffect, useState } from 'react'
import { Icon } from '../components/icons'
import { PhotoGallery } from '../components/PhotoGallery'
import {
  Bar,
  Chip,
  Cols,
  DangerBtn,
  Empty,
  Eyebrow,
  IconBtn,
  InlineArea,
  InlineText,
  NumCell,
  Page,
  Reorder,
  Scroller,
  Section,
  Spark,
  Stat,
  Tools,
} from '../components/ui'
import { fmtDateShort, fmtHours, lastNDates, todayISO, weekDates } from '../lib/dates'
import { golfAllTime, golfMinutes, golfMonthlySeries, golfWeeklySeries } from '../lib/stats'
import { useStore } from '../store/store'
import type { Taxon } from '../store/types'
