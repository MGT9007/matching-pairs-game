<?php
/**
 * Plugin Name: Matching Pairs Game
 * Description: 3-round matching pairs game with timer, scoring, personal and global rankings. Use shortcode [matching_pairs_game].
 * Version: 11.0.2
 * Author: MisterT9007
 */


if (!defined('ABSPATH')) exit;

class Matching_Pairs_Game {
    const VERSION      = '11.0.2';
    const TABLE        = 'mfsd_matching_pairs_scores';

    // Profanity filter - add more as needed
    private static $banned_words = array(
        'COCK', 'C0CK', 'COCKS', 'C0CKS',
        'KNOB', 'KN0B', 'KNOBS', 'KN0BS',
        'FUCK', 'F-CK', 'FVCK', 'FUK', 'FUC', 'F-K',
        'SHIT', 'SH1T', 'SHYT', 'SH-T',
        'PUSSY', 'PUSSIE', 'PUS5Y', 'P-SSY',
        'CUNT', 'C-NT', 'CVNT', 'C0NT',
        'DICK', 'D1CK', 'DICKS', 'D1CKS', 'D-CK',
        'PENIS', 'PEN1S', 'P3NIS',
        'VAGINA', 'VAG1NA', 'V-GINA',
        'BITCH', 'B1TCH', 'BYTCH', 'B-TCH',
        'BASTARD', 'B-STARD', 'BAST-RD',
        'WHORE', 'WH0RE', 'WHO-E',
        'SLUT', 'SL-T', '5LUT',
        'PISS', 'P1SS', 'P-SS',
        'NIGGER', 'N1GGER', 'NIGGA', 'N-GGER',
        'FAG', 'FAGGOT', 'F-GGOT', 'F-G',
        'ASS', 'A55', '-SS', 'ARSE', 'AR5E',
        'DAMN', 'D-MN', 'DAMM',
        'HELL', 'H3LL', 'H-LL',
        'TWAT', 'TW-T', '7WAT',
        'PRICK', 'PR1CK', 'P-ICK',
        'WANK', 'W-NK', 'WANKER', 'W-NKER',
        'TITS', 'T1TS', 'TIT5', 'BOOBS', 'BO0BS', 'B00BS',
    );

    public function __construct() {
        register_activation_hook(__FILE__, array($this, 'on_activate'));
        add_action('init', array($this, 'register_assets'));
        add_shortcode('matching_pairs_game', array($this, 'shortcode'));
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function on_activate() {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS $table (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NULL,
            initials VARCHAR(5) NULL,
            score INT UNSIGNED NOT NULL DEFAULT 0,
            time_left_ms INT UNSIGNED NOT NULL DEFAULT 0,
            matched_pairs INT UNSIGNED NOT NULL DEFAULT 0,
            round_reached TINYINT UNSIGNED NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ua VARCHAR(255) NULL,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY initials (initials),
            KEY score (score),
            KEY round_reached (round_reached)
        ) $charset_collate;";

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }

    public function register_assets() {
        $handle = 'matching-pairs-game';

        wp_register_script(
            $handle,
            plugins_url('assets/matching-pairs-game.js', __FILE__),
            array(),
            self::VERSION,
            true
        );

        wp_register_style(
            $handle,
            plugins_url('assets/matching-pairs-game.css', __FILE__),
            array(),
            self::VERSION
        );
    }

    public function shortcode($atts, $content = null) {
        $handle = 'matching-pairs-game';
        wp_enqueue_script($handle);
        wp_enqueue_style($handle);

        $config = array(
            'rest'   => array(
                'submit'   => esc_url_raw(rest_url('matching-pairs/v1/submit')),
                'personal' => esc_url_raw(rest_url('matching-pairs/v1/personal')),
                'global'   => esc_url_raw(rest_url('matching-pairs/v1/global')),
                'checkInitials' => esc_url_raw(rest_url('matching-pairs/v1/check-initials')),
            ),
            'user'   => is_user_logged_in() ? wp_get_current_user()->user_login : '',
            'nextUrl' => '', // placeholder for "next activity" button
            'assetsBase'=> plugins_url('assets/', __FILE__),
        );

        wp_add_inline_script(
            $handle,
            'window.MATCHING_PAIRS_CFG = ' . wp_json_encode($config) . ';',
            'before'
        );

        return '<div id="matching-pairs-root"></div>';
    }

    public function register_routes() {
        register_rest_route('matching-pairs/v1', '/submit', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'handle_submit'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route('matching-pairs/v1', '/personal', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'handle_personal'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route('matching-pairs/v1', '/global', array(
            'methods'             => 'GET',
            'callback'            => array($this, 'handle_global'),
            'permission_callback' => '__return_true',
        ));

        register_rest_route('matching-pairs/v1', '/check-initials', array(
            'methods'             => 'POST',
            'callback'            => array($this, 'handle_check_initials'),
            'permission_callback' => '__return_true',
        ));
    }

    private function sanitize_initials($input) {
        // Allow letters, numbers, spaces - up to 5 characters
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9 ]/', '', $input));
        return substr($clean, 0, 5);
    }

    private function is_profanity($initials) {
        $check = strtoupper(str_replace(' ', '', $initials));
        
        // Check for exact matches and partial matches
        foreach (self::$banned_words as $banned) {
            if ($check === $banned || strpos($check, $banned) !== false) {
                return true;
            }
        }
        
        return false;
    }

    public function handle_check_initials($request) {
        $params = json_decode($request->get_body(), true);
        if (!is_array($params)) {
            return array('ok' => false, 'error' => 'invalid_json');
        }

        $initials = isset($params['initials']) ? $params['initials'] : '';
        $sanitized = $this->sanitize_initials($initials);
        
        // Check if all blank/empty
        if (trim($sanitized) === '') {
            return array('ok' => false, 'error' => 'empty', 'message' => 'Initials cannot be empty or all spaces.');
        }

        // Check profanity
        if ($this->is_profanity($sanitized)) {
            return array('ok' => false, 'error' => 'profanity', 'message' => 'Please choose appropriate initials.');
        }

        return array('ok' => true, 'initials' => $sanitized);
    }

    public function handle_submit($request) {
        $params  = json_decode($request->get_body(), true);
        if (!is_array($params)) {
            return array('ok' => false, 'error' => 'invalid_json');
        }

        $initials = isset($params['initials']) ? $params['initials'] : '';
        $sanitized = $this->sanitize_initials($initials);
        
        // Final check before submission
        if (trim($sanitized) === '') {
            return array('ok' => false, 'error' => 'empty_initials');
        }

        if ($this->is_profanity($sanitized)) {
            return array('ok' => false, 'error' => 'profanity_detected');
        }

        $score    = isset($params['score']) ? intval($params['score']) : 0;
        $time_ms  = isset($params['time_left_ms']) ? intval($params['time_left_ms']) : 0;
        $pairs    = isset($params['matched_pairs']) ? intval($params['matched_pairs']) : 0;
        $round    = isset($params['round_reached']) ? intval($params['round_reached']) : 1;

        if ($score < 0) $score = 0;
        if ($time_ms < 0) $time_ms = 0;
        if ($pairs < 0) $pairs = 0;
        if ($round < 1) $round = 1;
        if ($round > 3) $round = 3;

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;

        $data = array(
            'user_id'      => get_current_user_id(),
            'initials'     => $sanitized,
            'score'        => $score,
            'time_left_ms' => $time_ms,
            'matched_pairs'=> $pairs,
            'round_reached'=> $round,
            'ua'           => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            'created_at'   => current_time('mysql'),
        );

        $ok = $wpdb->insert($table, $data);
        if (!$ok) {
            return array('ok' => false, 'error' => 'db_insert_failed');
        }

        return array('ok' => true, 'id' => $wpdb->insert_id, 'initials' => $sanitized);
    }

    public function handle_personal($request) {
        $initials = $request->get_param('initials') ?? '';
        $sanitized = $this->sanitize_initials($initials);

        if (!$sanitized || trim($sanitized) === '') {
            return array('ok' => true, 'scores' => array());
        }

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;

        // Top 5 scores for this initials
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT score, initials, round_reached, created_at 
                 FROM $table 
                 WHERE initials = %s 
                 ORDER BY score DESC, created_at ASC 
                 LIMIT 5",
                $sanitized
            ),
            ARRAY_A
        );

        return array('ok' => true, 'scores' => $rows);
    }

    public function handle_global($request) {
        $initials = $request->get_param('initials') ?? '';
        $sanitized = $this->sanitize_initials($initials);

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;

        // Top 300 for performance
        $rows = $wpdb->get_results(
            "SELECT id, score, initials, round_reached, created_at 
             FROM $table 
             ORDER BY score DESC, created_at ASC 
             LIMIT 300",
            ARRAY_A
        );

        $highlight_index = -1;
        if ($sanitized && trim($sanitized) !== '') {
            foreach ($rows as $i => $row) {
                if ($row['initials'] === $sanitized) {
                    $highlight_index = $i;
                    break;
                }
            }
        }

        return array(
            'ok'             => true,
            'scores'         => $rows,
            'highlightIndex' => $highlight_index,
        );
    }
}

new Matching_Pairs_Game();