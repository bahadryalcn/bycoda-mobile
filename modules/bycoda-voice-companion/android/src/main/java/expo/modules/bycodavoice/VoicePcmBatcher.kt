package expo.modules.bycodavoice

/**
 * Collects PCM16 reads into fixed-size batches so the bridge receives one event per batch instead of one per
 * 100 ms read. Reads land directly in the reusable batch buffer. A partial batch is flushed only when the sample
 * budget is spent, so the final audio is never dropped at the limit.
 */
internal class VoicePcmBatcher(
  private val batchBytes: Int,
  private val maxSamples: Int,
  private val onBatch: (ByteArray, Int) -> Unit,
) {
  private val batch = ByteArray(batchBytes)
  private var filled = 0
  private var samples = 0

  val buffer: ByteArray get() = batch
  val offset: Int get() = filled
  val finished: Boolean get() = samples >= maxSamples

  /** Largest read that fits both the open batch and the samples still allowed. */
  fun space(): Int = minOf(batchBytes - filled, (maxSamples - samples) * 2)

  fun accepted(count: Int) {
    filled += count
    samples += count / 2
    if (filled == batchBytes || finished) flush()
  }

  private fun flush() {
    if (filled == 0) return
    val size = filled
    filled = 0
    onBatch(batch, size)
  }
}
