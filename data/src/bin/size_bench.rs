use roaring::bitmap::Statistics;
use roaring_bench::{build_bitmap, dist_seed, parse_dist};
use std::io::Write;
use std::time::Instant;

const REPS: u32 = 3;

const UNIVERSE_SIZES: &[u64] = &[
    100_000,
    200_000,
    500_000,
    800_000,
    1_000_000,
    2_000_000,
    5_000_000,
    8_000_000,
    10_000_000,
    20_000_000,
    50_000_000,
    80_000_000,
    100_000_000,
    200_000_000,
    500_000_000,
    800_000_000,
    1_000_000_000,
];

const CARDINALITY_FRACTIONS: &[f64] = &[
    0.0001, 0.0002, 0.0005, 0.0008, 0.001, 0.002, 0.005, 0.008, 0.01, 0.02, 0.05, 0.08, 0.1, 0.2,
    0.5, 0.8, 1.0,
];

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dist = parse_dist(&args);
    let tag = dist.tag();

    let mut out = std::io::stdout().lock();
    writeln!(
        out,
        "{{\"type\":\"header\",\"distribution\":\"{}\",\"reps\":{},\"fields\":[\"n\",\"p\",\"rep\",\"k\",\"build_ms\",\"optimize_ms\",\"unoptimized.bytes\",\"unoptimized.stats.*\",\"optimized.bytes\",\"optimized.stats.*\"]}}",
        tag, REPS
    )
    .unwrap();
    out.flush().unwrap();

    for &n in UNIVERSE_SIZES {
        for &p in CARDINALITY_FRACTIONS {
            for rep in 0..REPS {
                let seed = (n.wrapping_mul(1_000_003))
                    ^ ((p.to_bits()).wrapping_mul(2_654_435_761))
                    ^ ((rep as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
                    ^ dist_seed(dist);

                let t0 = Instant::now();
                let mut bm = build_bitmap(dist, n, p, seed);
                let build_ms = t0.elapsed().as_secs_f64() * 1000.0;

                let k = bm.len();
                let unoptimized_bytes = bm.serialized_size();
                let unoptimized_stats = bm.statistics();

                let t1 = Instant::now();
                bm.optimize();
                let optimize_ms = t1.elapsed().as_secs_f64() * 1000.0;

                let optimized_bytes = bm.serialized_size();
                let optimized_stats = bm.statistics();

                writeln!(
                    out,
                    "{{\"type\":\"row\",\"distribution\":\"{}\",\"n\":{},\"p\":{},\"rep\":{},\"k\":{},\"build_ms\":{:.3},\"optimize_ms\":{:.3},\"unoptimized\":{{\"bytes\":{},\"stats\":{}}},\"optimized\":{{\"bytes\":{},\"stats\":{}}}}}",
                    tag, n, p, rep, k, build_ms, optimize_ms,
                    unoptimized_bytes, stats_json(&unoptimized_stats),
                    optimized_bytes, stats_json(&optimized_stats),
                )
                .unwrap();
                out.flush().unwrap();
                eprintln!(
                    "[{}] n={:>10} p={:<8} rep={} k={:>10} unopt={:>10}B opt={:>10}B (A/R/B={}/{}/{} -> {}/{}/{}) build={:>8.1}ms opt_ms={:>6.1}ms",
                    tag, n, p, rep, k, unoptimized_bytes, optimized_bytes,
                    unoptimized_stats.n_array_containers,
                    unoptimized_stats.n_run_containers,
                    unoptimized_stats.n_bitset_containers,
                    optimized_stats.n_array_containers,
                    optimized_stats.n_run_containers,
                    optimized_stats.n_bitset_containers,
                    build_ms, optimize_ms
                );
            }
        }
    }
}

fn stats_json(s: &Statistics) -> String {
    format!(
        "{{\"n_containers\":{},\"n_array_containers\":{},\"n_run_containers\":{},\"n_bitset_containers\":{},\"n_values_array_containers\":{},\"n_values_run_containers\":{},\"n_values_bitset_containers\":{},\"n_bytes_array_containers\":{},\"n_bytes_run_containers\":{},\"n_bytes_bitset_containers\":{},\"min_value\":{},\"max_value\":{},\"cardinality\":{}}}",
        s.n_containers,
        s.n_array_containers,
        s.n_run_containers,
        s.n_bitset_containers,
        s.n_values_array_containers,
        s.n_values_run_containers,
        s.n_values_bitset_containers,
        s.n_bytes_array_containers,
        s.n_bytes_run_containers,
        s.n_bytes_bitset_containers,
        s.min_value.map(|v| v.to_string()).unwrap_or_else(|| "null".into()),
        s.max_value.map(|v| v.to_string()).unwrap_or_else(|| "null".into()),
        s.cardinality,
    )
}
