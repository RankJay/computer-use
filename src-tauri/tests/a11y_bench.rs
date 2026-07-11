#![cfg(all(windows, feature = "a11y-bench"))]

#[test]
#[ignore = "requires interactive Windows desktop; run with --ignored --nocapture"]
fn a11y_bench_fixtures() {
    let summaries = actuate_lib::a11y_bench::run_all();
    assert!(
        summaries
            .iter()
            .any(|s| s.fixture == "notepad" && s.samples.iter().any(|x| x.ok)),
        "expected at least one successful Notepad sample"
    );
    assert!(
        summaries
            .iter()
            .any(|s| s.tool == "timeout_recovery" && s.samples.iter().all(|x| x.ok)),
        "expected timeout recovery samples to succeed (no queue poison)"
    );
}
