import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// The whole app is the live platform; the APK only adds what a browser tab
/// cannot: a home-screen icon, microphone + photo access, and native hand-off
/// for tel: (1930 / 112), WhatsApp and other apps.
const String kHome = 'https://sahaya.hmgenx.in/';
// Pages on these hosts stay inside the app (the old name still redirects here).
const Set<String> kHosts = {'sahaya.hmgenx.in', 'aapadbandhu.hmgenx.in'};
const Color kBrand = Color(0xFF1D4ED8);
const Color kRose = Color(0xFFE11D48);
const Color kPage = Color(0xFFF6F7FB);
const Color kInk = Color(0xFF0F172A);
const Color kMuted = Color(0xFF64748B);

/// Always light: light bars with dark icons, whatever the phone's dark mode says.
const SystemUiOverlayStyle kOverlay = SystemUiOverlayStyle(
  statusBarColor: kPage,
  statusBarIconBrightness: Brightness.dark,
  statusBarBrightness: Brightness.light,
  systemNavigationBarColor: Colors.white,
  systemNavigationBarIconBrightness: Brightness.dark,
  systemNavigationBarDividerColor: Colors.transparent,
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(kOverlay);
  runApp(const AapadbandhuApp());
}

class AapadbandhuApp extends StatelessWidget {
  const AapadbandhuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sahaya AI',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.light,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: kBrand, brightness: Brightness.light),
        scaffoldBackgroundColor: kPage,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with TickerProviderStateMixin {
  late final WebViewController _web;
  late final AnimationController _intro;
  Timer? _splashTimeout;

  double _progress = 0;
  bool _loading = true;
  bool _failed = false;

  // The splash leaves only when its intro has played AND the first page is in.
  bool _showSplash = true;
  bool _splashFading = false;
  bool _introDone = false;
  bool _firstPageDone = false;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))
      ..forward().whenComplete(() {
        _introDone = true;
        _maybeHideSplash();
      });
    // A slow network must not trap the user on the splash.
    _splashTimeout = Timer(const Duration(seconds: 9), () {
      _firstPageDone = true;
      _maybeHideSplash();
    });

    _web = WebViewController(onPermissionRequest: _onPermissionRequest)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kPage)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p / 100),
        onPageStarted: (_) => setState(() {
          _loading = true;
          _failed = false;
        }),
        onPageFinished: (_) {
          setState(() {
            _loading = false;
            _progress = 1;
          });
          _firstPageDone = true;
          _maybeHideSplash();
        },
        onWebResourceError: (e) {
          if (!(e.isForMainFrame ?? true)) return;
          setState(() {
            _failed = true;
            _loading = false;
          });
          _firstPageDone = true;
          _maybeHideSplash();
        },
        onNavigationRequest: _onNavigation,
      ));

    final platform = _web.platform;
    if (platform is AndroidWebViewController) {
      // The agent's Telugu reply plays right after the network round trip,
      // not inside the tap that started the call.
      platform.setMediaPlaybackRequiresUserGesture(false);
      // Scam Shield's "upload screenshot" is a plain <input type=file>.
      platform.setOnShowFileSelector(_pickFile);
    }
    _tagUserAgent();
    _web.loadRequest(Uri.parse(kHome));
  }

  @override
  void dispose() {
    _splashTimeout?.cancel();
    _intro.dispose();
    super.dispose();
  }

  void _maybeHideSplash() {
    if (!mounted || !_showSplash || _splashFading || !_introDone || !_firstPageDone) return;
    _splashTimeout?.cancel();
    setState(() => _splashFading = true);
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _showSplash = false);
    });
  }

  Future<void> _tagUserAgent() async {
    try {
      final ua = await _web.getUserAgent();
      if (ua != null && !ua.contains('SahayaApp')) {
        await _web.setUserAgent('$ua SahayaApp/1.0');
      }
    } catch (_) {}
  }

  /// getUserMedia inside the page: the OS permission first, then the page's.
  Future<void> _onPermissionRequest(WebViewPermissionRequest request) async {
    final wantsMic = request.types.contains(WebViewPermissionResourceType.microphone);
    if (wantsMic) {
      final status = await Permission.microphone.request();
      if (!status.isGranted) {
        await request.deny();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Microphone permission is needed for voice calls. You can still type.'),
          ));
        }
        return;
      }
    }
    await request.grant();
  }

  Future<List<String>> _pickFile(FileSelectorParams params) async {
    try {
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (picked == null) return [];
      return [Uri.file(picked.path).toString()];
    } catch (_) {
      return [];
    }
  }

  /// Our own pages stay in the app; phone numbers, WhatsApp and every other
  /// site open in the app that owns them.
  Future<NavigationDecision> _onNavigation(NavigationRequest req) async {
    final uri = Uri.tryParse(req.url);
    if (uri == null) return NavigationDecision.prevent;
    final inApp = (uri.scheme == 'https' || uri.scheme == 'http') && kHosts.contains(uri.host);
    if (inApp || uri.scheme == 'about' || uri.scheme == 'data' || uri.scheme == 'blob') {
      return NavigationDecision.navigate;
    }
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
    return NavigationDecision.prevent;
  }

  Future<void> _retry() async {
    setState(() {
      _failed = false;
      _loading = true;
      _progress = 0;
    });
    await _web.loadRequest(Uri.parse(kHome));
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: kOverlay,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          if (await _web.canGoBack()) {
            await _web.goBack();
          } else {
            await SystemNavigator.pop();
          }
        },
        child: Scaffold(
          backgroundColor: kPage,
          body: SafeArea(
            bottom: false,
            child: Stack(
              children: [
                Positioned.fill(child: WebViewWidget(controller: _web)),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: _TopProgress(progress: _progress, visible: _loading && !_failed && !_showSplash),
                ),
                Positioned.fill(
                  child: IgnorePointer(
                    ignoring: !_failed,
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 380),
                      switchInCurve: Curves.easeOutCubic,
                      switchOutCurve: Curves.easeInCubic,
                      transitionBuilder: (child, anim) => FadeTransition(
                        opacity: anim,
                        child: ScaleTransition(
                          scale: Tween<double>(begin: 0.98, end: 1).animate(anim),
                          child: child,
                        ),
                      ),
                      child: _failed
                          ? _Offline(key: const ValueKey('offline'), onRetry: _retry)
                          : const SizedBox.shrink(key: ValueKey('online')),
                    ),
                  ),
                ),
                if (_showSplash)
                  Positioned.fill(
                    child: IgnorePointer(
                      ignoring: _splashFading,
                      child: AnimatedOpacity(
                        opacity: _splashFading ? 0 : 1,
                        duration: const Duration(milliseconds: 480),
                        curve: Curves.easeOutCubic,
                        child: AnimatedScale(
                          scale: _splashFading ? 1.04 : 1,
                          duration: const Duration(milliseconds: 480),
                          curve: Curves.easeOutCubic,
                          child: _Splash(intro: _intro),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Thin brand-gradient bar that eases to the page's load progress and fades
/// out when the page is in.
class _TopProgress extends StatelessWidget {
  const _TopProgress({required this.progress, required this.visible});

  final double progress;
  final bool visible;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 320),
      child: LayoutBuilder(
        builder: (context, box) => Align(
          alignment: Alignment.centerLeft,
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(end: progress.clamp(0.06, 1.0)),
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            builder: (context, v, _) => Container(
              width: box.maxWidth * v,
              height: 3,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [kBrand, kRose]),
                borderRadius: const BorderRadius.horizontal(right: Radius.circular(3)),
                boxShadow: [BoxShadow(color: kRose.withValues(alpha: 0.35), blurRadius: 6)],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash({required this.intro});

  final Animation<double> intro;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kPage,
      alignment: Alignment.center,
      child: AnimatedBuilder(
        animation: intro,
        builder: (context, _) {
          final t = intro.value;
          final logoScale = Curves.easeOutBack.transform(const Interval(0.0, 0.6).transform(t));
          final logoFade = Curves.easeOut.transform(const Interval(0.0, 0.4).transform(t));
          final textT = Curves.easeOutCubic.transform(const Interval(0.35, 1.0).transform(t));
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Opacity(
                opacity: logoFade,
                child: Transform.scale(
                  scale: 0.6 + 0.4 * logoScale,
                  child: Container(
                    width: 112,
                    height: 112,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [
                        BoxShadow(color: kBrand.withValues(alpha: 0.22), blurRadius: 28, offset: const Offset(0, 12)),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(28),
                      child: Image.asset('assets/icon.png', fit: BoxFit.cover),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Opacity(
                opacity: textT,
                child: Transform.translate(
                  offset: Offset(0, 14 * (1 - textT)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ShaderMask(
                        shaderCallback: (r) => const LinearGradient(colors: [kBrand, kRose]).createShader(r),
                        child: const Text(
                          'Sahaya AI',
                          style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.3),
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text('Your AI helper', style: TextStyle(fontSize: 15, color: kMuted, letterSpacing: 0.2)),
                      const SizedBox(height: 28),
                      const _Dots(),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Three dots breathing in sequence while the first page loads.
class _Dots extends StatefulWidget {
  const _Dots();

  @override
  State<_Dots> createState() => _DotsState();
}

class _DotsState extends State<_Dots> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (i) {
          final phase = (_c.value - i * 0.18) % 1.0;
          final k = Curves.easeInOut.transform(phase < 0.5 ? phase * 2 : (1 - phase) * 2);
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Color.lerp(kBrand, kRose, i / 2)!.withValues(alpha: 0.35 + 0.65 * k),
            ),
            transform: Matrix4.translationValues(0, -4 * k, 0),
          );
        }),
      ),
    );
  }
}

class _Offline extends StatelessWidget {
  const _Offline({super.key, required this.onRetry});

  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kPage,
      padding: const EdgeInsets.all(28),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.7, end: 1),
            duration: const Duration(milliseconds: 600),
            curve: Curves.easeOutBack,
            builder: (context, s, child) => Transform.scale(scale: s, child: child),
            child: Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(color: kBrand.withValues(alpha: 0.08), shape: BoxShape.circle),
              child: const Icon(Icons.wifi_off_rounded, size: 44, color: kBrand),
            ),
          ),
          const SizedBox(height: 18),
          const Text(
            'No internet connection',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: kInk),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          const Text(
            'Check your connection and try again.\nIn an emergency, call 112.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: kMuted, height: 1.4),
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: [
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
              OutlinedButton.icon(
                onPressed: () => launchUrl(Uri.parse('tel:112')),
                icon: const Icon(Icons.call_rounded),
                label: const Text('Call 112'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
