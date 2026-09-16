import type { Card, JobStatus } from '../../lib/types'

/** The slice of the joined current generation a tile needs for its thumbnail. */
export interface BoardGeneration {
  id: string
  image_path: string | null
  status: JobStatus
}

/**
 * A card row plus the two joins the board reads. Realtime payloads carry only the
 * bare row, so both joins are optional until the debounced refetch fills them in.
 */
export interface BoardCard extends Card {
  client?: { name: string } | null
  current_generation?: BoardGeneration | null
}

/** Client rows the filter select needs. */
export interface ClientOption {
  id: string
  name: string
  active: boolean
}
