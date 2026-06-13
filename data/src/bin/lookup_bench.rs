// Lookup latency benchmark — Roaring.
//
// For each (dist, n, p) cell we build REPS=3 bitmap generations (different
// seeds). For each generation we draw 99 "found" needles (uniform over the
// member set, via reservoir sampling during the ascending stream pass) and
// 99 "not-found" needles (rejection sampling over [0, n)). We then time a
// single `contains(needle)` call per needle via `Instant::now()` at
// nanosecond resolution.
//
// Aggregation is done in post-processing across 3·99 = 297 per-scenario
// samples (min, median, p90). Note: on hardware where `Instant` resolution
// is ~20 ns, a single `contains()` timing is partly dominated by clock
// noise — that's why we also collect min and p90 instead of just the
// median.
//
// Not-found at p=1.0: every value is a member, so no needle can be
// sampled. Those rows emit `"not_found_samples": 0` and no not-found
// timings.

use rand::{Rng, SeedableRng};
use rand_pcg::Pcg64Mcg;
use roaring::RoaringBitmap;
use roaring_bench::{dist_seed, parse_dist, stream_ascending, Dist};
use std::hint::black_box;
use std::io::Write;
use std::time::Instant;

const REPS: u32 = 3;
const LOOKUPS_PER_BITMAP: usize = 99;

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

fn seed_for(dist: Dist, n: u64, p: f64, rep: u32) -> u64 {
    n.wrapping_mul(1_000_003)
        ^ p.to_bits().wrapping_mul(2_654_435_761)
        ^ (rep as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ dist_seed(dist)
}

// Build the RoaringBitmap and reservoir-sample `k_sample` found-needles
// during the same stream pass. Returns (roaring, actual_k, found_needles).
fn build(
    dist: Dist,
    n: u64,
    p: f64,
    seed: u64,
    k_sample: usize,
    needle_rng: &mut Pcg64Mcg,
) -> (RoaringBitmap, u64, Vec<u32>) {
    let mut r = RoaringBitmap::new();
    let mut reservoir: Vec<u32> = Vec::with_capacity(k_sample);
    let mut i: u64 = 0;
    let mut count: u64 = 0;
    stream_ascending(dist, n, p, seed, |v| {
        r.insert(v);
        // Vitter's reservoir: first k_sample go in, then replace with
        // prob k_sample/i for i > k_sample.
        if (i as usize) < k_sample {
            reservoir.push(v);
        } else {
            let j = needle_rng.gen_range(0..=i);
            if (j as usize) < k_sample {
                reservoir[j as usize] = v;
            }
        }
        i += 1;
        count += 1;
    });
    r.optimize();
    (r, count, reservoir)
}

// Rejection-sample `want` non-members from [0, n). Bounded attempts:
// at very high p the fraction of non-members is small and we may fall
// short — returned Vec can have fewer than `want` elements.
fn not_found_needles(
    n: u64,
    r: &RoaringBitmap,
    rng: &mut Pcg64Mcg,
    want: usize,
) -> Vec<u32> {
    if n == 0 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(want);
    let max = (n as u32).saturating_sub(1);
    let max_attempts = (want as u64).saturating_mul(64).max(want as u64) + 1024;
    let mut attempts: u64 = 0;
    while out.len() < want && attempts < max_attempts {
        let candidate: u32 = if max == u32::MAX {
            rng.gen()
        } else {
            rng.gen_range(0..=max)
        };
        if !r.contains(candidate) {
            out.push(candidate);
        }
        attempts += 1;
    }
    out
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dist = parse_dist(&args);
    let tag = dist.tag();

    let mut out = std::io::stdout().lock();
    writeln!(
        out,
        "{{\"type\":\"header\",\"distribution\":\"{}\",\"library\":\"roaring\",\"reps\":{},\"lookups_per_bitmap\":{},\"scenarios\":[\"found\",\"not_found\"]}}",
        tag, REPS, LOOKUPS_PER_BITMAP
    ).unwrap();
    out.flush().unwrap();

    for &n in UNIVERSE_SIZES {
        for &p in CARDINALITY_FRACTIONS {
            let mut found_ns: Vec<u64> =
                Vec::with_capacity(REPS as usize * LOOKUPS_PER_BITMAP);
            let mut missing_ns: Vec<u64> =
                Vec::with_capacity(REPS as usize * LOOKUPS_PER_BITMAP);

            let mut total_k: u64 = 0;
            let mut total_not_found_drawn: u64 = 0;

            for rep in 0..REPS {
                let seed = seed_for(dist, n, p, rep);
                let mut needle_rng = Pcg64Mcg::seed_from_u64(seed ^ 0xDEAD_BEEF_CAFE_F00D);

                let (r, k, mut found) =
                    build(dist, n, p, seed, LOOKUPS_PER_BITMAP, &mut needle_rng);
                total_k += k;

                let mut missing = not_found_needles(n, &r, &mut needle_rng, LOOKUPS_PER_BITMAP);
                total_not_found_drawn += missing.len() as u64;

                // Shuffle probe order so it's uncorrelated with the
                // ascending build stream.
                fisher_yates(&mut found, &mut needle_rng);
                fisher_yates(&mut missing, &mut needle_rng);

                for &needle in &found {
                    let t0 = Instant::now();
                    let hit = r.contains(black_box(needle));
                    let ns = t0.elapsed().as_nanos() as u64;
                    black_box(hit);
                    found_ns.push(ns);
                }
                for &needle in &missing {
                    let t0 = Instant::now();
                    let hit = r.contains(black_box(needle));
                    let ns = t0.elapsed().as_nanos() as u64;
                    black_box(hit);
                    missing_ns.push(ns);
                }
            }

            writeln!(
                out,
                "{{\"type\":\"row\",\"distribution\":\"{}\",\"library\":\"roaring\",\"n\":{},\"p\":{},\"reps\":{},\"lookups_per_bitmap\":{},\"mean_k\":{:.1},\"not_found_samples\":{},\"found_ns\":{},\"not_found_ns\":{}}}",
                tag, n, p, REPS, LOOKUPS_PER_BITMAP,
                total_k as f64 / REPS as f64,
                total_not_found_drawn,
                ns_list_json(&found_ns),
                ns_list_json(&missing_ns),
            ).unwrap();
            out.flush().unwrap();

            eprintln!(
                "[{}] n={:>10} p={:<8} k~{:<12.0} not_found_samples={} | found median={:>6}ns missing median={:>6}ns",
                tag, n, p, total_k as f64 / REPS as f64, total_not_found_drawn,
                quick_median(&found_ns),
                quick_median(&missing_ns),
            );
        }
    }
}

fn ns_list_json(xs: &[u64]) -> String {
    let mut s = String::with_capacity(xs.len() * 5);
    s.push('[');
    for (i, v) in xs.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&v.to_string());
    }
    s.push(']');
    s
}

fn fisher_yates<T>(xs: &mut [T], rng: &mut Pcg64Mcg) {
    for i in (1..xs.len()).rev() {
        let j = rng.gen_range(0..=i);
        xs.swap(i, j);
    }
}

fn quick_median(xs: &[u64]) -> u64 {
    if xs.is_empty() {
        return 0;
    }
    let mut v = xs.to_vec();
    v.sort_unstable();
    v[v.len() / 2]
}
