<?php
/**
 * Plugin Name: Matching Pairs Game
 * Description: 32-card matching pairs game with timer, scoring, personal and global rankings. Use shortcode [matching_pairs_game].
 * Version: 10.0.2
 * Author: MisterT9007
 */


if (!defined('ABSPATH')) exit;

class Matching_Pairs_Game {
    const VERSION      = '10.0.2';
    const TABLE        = 'matching_pairs_scores';

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
            initials VARCHAR(3) NULL,
            score INT UNSIGNED NOT NULL DEFAULT 0,
            time_left_ms INT UNSIGNED NOT NULL DEFAULT 0,
            matched_pairs INT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ua VARCHAR(255) NULL,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY initials (initials),
            KEY score (score)
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
            'permission_callback' => '__return_true', // using no-nonce to keep it simple
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
    }

    public function handle_submit($request) {
        $params  = json_decode($request->get_body(), true);
        if (!is_array($params)) {
            return array('ok' => false, 'error' => 'invalid_json');
        }

        $initials = isset($params['initials']) ? strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $params['initials']), 0, 3)) : '';
        $score    = isset($params['score']) ? intval($params['score']) : 0;
        $time_ms  = isset($params['time_left_ms']) ? intval($params['time_left_ms']) : 0;
        $pairs    = isset($params['matched_pairs']) ? intval($params['matched_pairs']) : 0;

        if ($score < 0) $score = 0;
        if ($time_ms < 0) $time_ms = 0;
        if ($pairs < 0) $pairs = 0;

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;

        $data = array(
            'user_id'      => get_current_user_id(),
            'initials'     => $initials ?: null,
            'score'        => $score,
            'time_left_ms' => $time_ms,
            'matched_pairs'=> $pairs,
            'ua'           => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            'created_at'   => current_time('mysql'),
        );

        $ok = $wpdb->insert($table, $data);
        if (!$ok) {
            return array('ok' => false, 'error' => 'db_insert_failed');
        }

        return array('ok' => true, 'id' => $wpdb->insert_id, 'initials' => $initials);
    }

    public function handle_personal($request) {
        $initials = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $request->get_param('initials') ?? ''), 0, 3));

        if (!$initials) {
            return array('ok' => true, 'scores' => array());
        }

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;

        // Top 5 scores for this initials
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT score, initials, created_at 
                 FROM $table 
                 WHERE initials = %s 
                 ORDER BY score DESC, created_at ASC 
                 LIMIT 5",
                $initials
            ),
            ARRAY_A
        );

        return array('ok' => true, 'scores' => $rows);
    }

    public function handle_global($request) {
        $initials = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $request->get_param('initials') ?? ''), 0, 3));

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;

        // Limit for performance – adjust if needed
        $rows = $wpdb->get_results(
            "SELECT id, score, initials, created_at 
             FROM $table 
             ORDER BY score DESC, created_at ASC 
             LIMIT 300",
            ARRAY_A
        );

        $highlight_index = -1;
        if ($initials) {
            foreach ($rows as $i => $row) {
                if ($row['initials'] === $initials) {
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
