package expo.modules.bycodavoice

import org.junit.Assert.*
import org.junit.Test

class VoicePcmBatcherTest {
  @Test fun batchesReadsIntoFixedEventsAndFlushesTheRemainderAtTheSampleBudget() {
    val batches = mutableListOf<Int>()
    val batcher = VoicePcmBatcher(batchBytes = 8, maxSamples = 6) { _, size -> batches += size }
    // 12 bytes = 6 samples, the whole budget: 8-byte batch flushes, then the 4-byte remainder flushes on finish.
    batcher.accepted(4); assertEquals(0, batches.size)
    assertEquals(4, batcher.offset)
    assertEquals(4, batcher.space())
    batcher.accepted(4); assertEquals(listOf(8), batches)
    assertFalse(batcher.finished)
    batcher.accepted(4); assertEquals(listOf(8, 4), batches)
    assertTrue(batcher.finished)
  }

  @Test fun readNeverOverrunsTheBatchOrTheSampleBudget() {
    val batcher = VoicePcmBatcher(batchBytes = 10, maxSamples = 3) { _, _ -> }
    assertEquals(6, batcher.space())
    batcher.accepted(4)
    assertEquals(2, batcher.space())
  }

  @Test fun flushedBytesAreExactlyTheCapturedPrefix() {
    val out = mutableListOf<ByteArray>()
    val batcher = VoicePcmBatcher(batchBytes = 4, maxSamples = 100) { audio, size -> out += audio.copyOf(size) }
    val source = byteArrayOf(1, 2, 3, 4)
    System.arraycopy(source, 0, batcher.buffer, batcher.offset, 4)
    batcher.accepted(4)
    assertArrayEquals(source, out.single())
  }

  @Test fun batchSizeMatchesThreeHundredMilliseconds() {
    assertEquals(9600, VoiceSessionPolicy.PCM_BATCH_BYTES)
    assertEquals(VoiceSessionPolicy.SAMPLE_RATE * 2 * 3 / 10, VoiceSessionPolicy.PCM_BATCH_BYTES)
  }
}
